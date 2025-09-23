-- ALLABLE Application Database Schema
-- PostgreSQL Version

-- Drop tables if they exist to ensure a clean slate on setup.
DROP TABLE IF EXISTS personalized_dashboards CASCADE;
DROP TABLE IF EXISTS usage_logs CASCADE;
DROP TABLE IF EXISTS emergency_contacts CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;


-- Table to store user profile and preferences.
-- The output preference has been removed as all features are available initially.
-- ML will determine the optimal layout via the personalized_dashboards table.
CREATE TABLE user_preferences (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) UNIQUE NOT NULL,

    profile_type VARCHAR(50) NOT NULL CHECK (profile_type IN (
        'visually-impaired',
        'deaf-non-speech',
        'elderly',
        'illiterate'
    )),

    -- Preferred language for UI and TTS. 'default-sign' for deaf-non-speech.
    language VARCHAR(20) DEFAULT 'en' NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table to store emergency contacts for a user.
CREATE TABLE emergency_contacts (
    id SERIAL PRIMARY KEY,
    user_id_ref VARCHAR(255) REFERENCES user_preferences(user_id) ON DELETE CASCADE,
    contact_name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    relationship VARCHAR(50), 
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table for logging feature usage for ML personalization.
-- This is crucial for monitoring user data to adapt the app experience.
CREATE TABLE usage_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id_ref VARCHAR(255) REFERENCES user_preferences(user_id) ON DELETE CASCADE,
    feature_used VARCHAR(100) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB
);

-- Table to store the ML-generated personalized dashboard for each user.
-- This allows the app to dynamically change the UI based on monitored usage.
CREATE TABLE personalized_dashboards (
    id SERIAL PRIMARY KEY,
    user_id_ref VARCHAR(255) UNIQUE REFERENCES user_preferences(user_id) ON DELETE CASCADE,
    
    -- JSONB to store the configuration, e.g., order of buttons.
    -- Example: { "feature_order": ["Voice Assistant", "Image-to-Speech", "Navigation Aid"] }
    dashboard_config JSONB NOT NULL,
    
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- --- INDEXES ---
CREATE INDEX idx_emergency_contacts_user_id ON emergency_contacts(user_id_ref);
CREATE INDEX idx_usage_logs_user_id_timestamp ON usage_logs(user_id_ref, timestamp DESC);
CREATE INDEX idx_personalized_dashboards_user_id ON personalized_dashboards(user_id_ref);

-- --- COMMENTS ---
COMMENT ON TABLE user_preferences IS 'Stores the core profile and language settings for each user.';
COMMENT ON COLUMN user_preferences.user_id IS 'Client-generated unique identifier (e.g., UUID).';
COMMENT ON TABLE usage_logs IS 'Records user interactions to train the personalization model.';
COMMENT ON TABLE personalized_dashboards IS 'Stores ML-generated dashboard layouts for a personalized user experience.';

