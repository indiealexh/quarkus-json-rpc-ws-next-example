create table public.task
(
    uuid uuid  not null
        constraint task_uuid_uq
            unique,
    id   bigserial
        constraint task_pk
            primary key,
    data jsonb not null
);

comment on column public.task.uuid is 'UUID of the task, which is used by client to relate tasks even when the submission status is unknown';

alter table public.task
    owner to quarkus;

