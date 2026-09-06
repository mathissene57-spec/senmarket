-- MediaRecorder rapporte souvent un mimeType avec suffixe de codec
-- (ex: "audio/webm;codecs=opus") -- une liste de types exacts comme
-- 'audio/webm' peut donc rejeter des uploads legitimes selon la
-- correspondance faite par le serveur de stockage. Les wildcards
-- documentes ('image/*', 'audio/*') evitent ce risque de correspondance
-- exacte ratee, sans elargir au-dela des deux familles deja prevues.
update storage.buckets
set allowed_mime_types = array['image/*', 'audio/*']
where id = 'messages-media';
