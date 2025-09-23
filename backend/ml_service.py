from flask import Flask, request, jsonify
from transformers import BlipProcessor, BlipForConditionalGeneration, MarianMTModel, MarianTokenizer
from PIL import Image
import io
import base64
import re
import random
import pytesseract
import numpy as np
import cv2
import mediapipe as mp

# --- Tesseract Configuration ---
# If Tesseract is not in your system's PATH, you may need to specify its path.
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

app = Flask(__name__)

# --- In-memory ML Model Loading ---
print("Loading Blip model for Image-to-Speech...")
blip_processor = BlipProcessor.from_pretrained("Salesforce/blip-image-captioning-base")
blip_model = BlipForConditionalGeneration.from_pretrained("Salesforce/blip-image-captioning-base")
print("Blip model loaded successfully.")

# --- Translation Model Caching ---
translation_models = {}
print("Translation models will be loaded on demand.")

# --- MediaPipe Hand Tracking Setup ---
mp_hands = mp.solutions.hands
hands = mp.solutions.hands.Hands(static_image_mode=True, max_num_hands=1, min_detection_confidence=0.7)

def get_translation_model(target_lang):
    """Loads and caches a translation model for a specific target language."""
    lang_map = {
        'kn': 'Helsinki-NLP/opus-mt-en-kn', # Kannada
        'hi': 'Helsinki-NLP/opus-mt-en-hi', # Hindi
        'ta': 'Helsinki-NLP/opus-mt-en-ta', # Tamil
        'te': 'Helsinki-NLP/opus-mt-en-te', # Telugu
    }
    if target_lang not in lang_map:
        return None, None
    model_name = lang_map.get(target_lang)
    if model_name not in translation_models:
        print(f"Loading translation model for {target_lang}...")
        try:
            tokenizer = MarianTokenizer.from_pretrained(model_name)
            model = MarianMTModel.from_pretrained(model_name)
            translation_models[model_name] = (tokenizer, model)
            print(f"Model for {target_lang} loaded successfully.")
        except Exception as e:
            print(f"Failed to load translation model {model_name}: {e}")
            return None, None
    return translation_models[model_name]

def clean_base64_image(image_data_url):
    """Removes the 'data:image/jpeg;base64,' prefix from the image data URL."""
    return re.sub('^data:image/.+;base64,', '', image_data_url)

def recognize_simple_sign(landmarks):
    """Recognizes simple signs for 'Yes', 'No', and 'Hello'."""
    try:
        # Get landmark coordinates
        thumb_tip = landmarks.landmark[mp_hands.HandLandmark.THUMB_TIP]
        index_tip = landmarks.landmark[mp_hands.HandLandmark.INDEX_FINGER_TIP]
        middle_tip = landmarks.landmark[mp_hands.HandLandmark.MIDDLE_FINGER_TIP]
        ring_tip = landmarks.landmark[mp_hands.HandLandmark.RING_FINGER_TIP]
        pinky_tip = landmarks.landmark[mp_hands.HandLandmark.PINKY_TIP]
        
        index_pip = landmarks.landmark[mp_hands.HandLandmark.INDEX_FINGER_PIP]
        middle_pip = landmarks.landmark[mp_hands.HandLandmark.MIDDLE_FINGER_PIP]
        ring_pip = landmarks.landmark[mp_hands.HandLandmark.RING_FINGER_PIP]
        pinky_pip = landmarks.landmark[mp_hands.HandLandmark.PINKY_PIP]

        # Gesture 1: "Hello" (Open Palm)
        if (index_tip.y < index_pip.y and
            middle_tip.y < middle_pip.y and
            ring_tip.y < ring_pip.y and
            pinky_tip.y < pinky_pip.y):
            return "Hello"

        # Gesture 2: "Yes" (Thumbs Up)
        if thumb_tip.y < index_pip.y and index_tip.y > index_pip.y and pinky_tip.y > pinky_pip.y:
            return "Yes"
        
        # Gesture 3: "No" (Closed Fist)
        if index_tip.y > index_pip.y and pinky_tip.y > pinky_pip.y and thumb_tip.x > index_tip.x:
             return "No"

    except Exception as e:
        print(f"Error in sign logic: {e}")
        return None
    return None


# --- AI Endpoints ---

@app.route('/predict-shortcut', methods=['POST'])
def predict_shortcut():
    data = request.json
    profile = data.get('profileType')
    if profile == 'visually-impaired':
        prediction = random.choice(['Image-to-Speech', 'Voice Assistant', 'Read Document'])
    elif profile == 'elderly':
        prediction = random.choice(['Reminders', 'Voice News'])
    else:
        prediction = random.choice(['Speech-to-Text', 'Text Translator', 'Text-to-Icon'])
    return jsonify({'predicted_feature': prediction})

@app.route('/api/image-to-speech', methods=['POST'])
def image_to_speech():
    try:
        image_data = request.json['imageData']
        cleaned_image_data = clean_base64_image(image_data)
        image = Image.open(io.BytesIO(base64.b64decode(cleaned_image_data))).convert('RGB')
        inputs = blip_processor(images=image, return_tensors="pt")
        outputs = blip_model.generate(**inputs, max_new_tokens=50)
        caption = blip_processor.decode(outputs[0], skip_special_tokens=True)
        return jsonify({'caption': caption})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/read-document', methods=['POST'])
def read_document():
    try:
        image_data = request.json['imageData']
        cleaned_image_data = clean_base64_image(image_data)
        image = Image.open(io.BytesIO(base64.b64decode(cleaned_image_data)))
        extracted_text = pytesseract.image_to_string(image)
        if not extracted_text.strip():
            extracted_text = "No readable text was found in the image."
        return jsonify({'text': extracted_text})
    except pytesseract.TesseractNotFoundError:
        return jsonify({'error': 'Tesseract OCR engine not found on the server.'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/translate-text', methods=['POST'])
def translate_text():
    try:
        data = request.json
        text_to_translate = data.get('text')
        target_lang_code = data.get('target_lang', 'en').split('-')[0]
        if target_lang_code == 'en':
            return jsonify({'translated_text': text_to_translate})
        tokenizer, model = get_translation_model(target_lang_code)
        if not model or not tokenizer:
            return jsonify({'error': f'Translation model for language "{target_lang_code}" is not available.'}), 400
        tokenized_text = tokenizer(text_to_translate, return_tensors="pt", padding=True, truncation=True, max_length=512)
        translated_tokens = model.generate(**tokenized_text, max_length=512)
        translated_text = tokenizer.decode(translated_tokens[0], skip_special_tokens=True)
        return jsonify({'translated_text': translated_text})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/text-to-icon', methods=['POST'])
def text_to_icon():
    icon_map = {
        'help': '🆘', 'love': '❤️', 'thank you': '🙏', 'yes': '✅', 'no': '❌', 'idea': '💡', 'happy': '😊', 'sad': '😢',
        'home': '🏠', 'house': '🏠', 'school': '🏫', 'hospital': '🏥', 'clinic': '🏥', 'pharmacy': '💊', 'shop': '🛒', 'store': '🛒', 'market': '🛒', 'restroom': '🚽', 'toilet': '🚽', 'bank': '🏦', 'post office': '🏤',
        'family': '👨‍👩‍👧', 'doctor': '🧑‍⚕️', 'nurse': '🧑‍⚕️', 'teacher': '🧑‍🏫', 'call': '📞', 'phone': '📞', 'talk': '🗣️', 'eat': '🍔', 'food': '🍔', 'drink': '💧', 'water': '💧', 'read': '📖', 'write': '✍️', 'sleep': '😴',
        'money': '💰', 'car': '🚗', 'bus': '🚌', 'medicine': '💊', 'pill': '💊', 'book': '📖', 'time': '⏰', 'clock': '⏰', 'today': '📅', 'day': '☀️', 'night': '🌙',
    }
    try:
        data = request.json
        text = data.get('text', '').lower()
        cleaned_text = re.sub(r'[^\w\s]', '', text)
        words = cleaned_text.split()
        icons = []
        found_words = []
        for word in words:
            singular_word = word.rstrip('s')
            if word in icon_map:
                if word not in found_words:
                    icons.append(icon_map[word])
                    found_words.append(word)
            elif singular_word in icon_map:
                if singular_word not in found_words:
                    icons.append(icon_map[singular_word])
                    found_words.append(singular_word)
        return jsonify({'icons': ' '.join(icons), 'found_words': found_words})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/recognize-command', methods=['POST'])
def recognize_command():
    intents = {
        'find_hospital': ['hospital', 'clinic', 'doctor', 'emergency room', 'medical'],
        'call_family': ['call my family', 'phone home', 'contact family'],
        'read_news': ['read the news', 'what are the headlines', 'news update'],
        'open_translator': ['translate', 'translator'],
        'go_home': ['go home', 'back to main screen', 'dashboard']
    }
    try:
        data = request.json
        command = data.get('command', '').lower()
        for intent, keywords in intents.items():
            for keyword in keywords:
                if keyword in command:
                    return jsonify({'intent': intent})
        return jsonify({'intent': 'none'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sign-to-speech', methods=['POST'])
def sign_to_speech():
    data = request.json
    base64_image = clean_base64_image(data['imageData'])
    image_bytes = base64.b64decode(base64_image)
    nparr = np.frombuffer(image_bytes, np.uint8)
    img_np = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    img_rgb = cv2.cvtColor(img_np, cv2.COLOR_BGR2RGB)
    
    results = hands.process(img_rgb)
    
    recognized_word = "No sign detected"
    if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
            word = recognize_simple_sign(hand_landmarks)
            if word:
                recognized_word = word
                break 

    return jsonify({'word': recognized_word})

if __name__ == '__main__':
    app.run(port=5001)
