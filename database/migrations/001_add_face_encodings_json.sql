-- Add multi-pose face encodings (run once if users table was created before this column existed)
-- If you get "Duplicate column" you can ignore it.
ALTER TABLE users ADD COLUMN face_encodings_json TEXT NULL AFTER face_encoding_blob;
