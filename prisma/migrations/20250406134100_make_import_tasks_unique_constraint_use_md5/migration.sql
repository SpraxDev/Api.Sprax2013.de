DROP INDEX public.import_tasks_payload_type_payload_key;

CREATE UNIQUE INDEX
    import_tasks_payload_type_payload_key
    ON
    public.import_tasks (payload_type, md5(payload));
