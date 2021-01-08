create type http_methods as enum ('GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE', 'PATCH', 'NON_STANDARD');

create table user_agents
(
    id   bigserial     not null
        constraint user_agents_pk primary key,
    name varchar(8192) not null
);

create table sprax_api
(
    remote_addr     inet                     not null,
    method          http_methods             not null,
    path            varchar(8192)            not null,
    status          integer                  not null,
    body_bytes      bigint                   not null,
    res_time_millis bigint                   not null,
    agent           bigint                   not null
        constraint spraxapi_user_agents_id_fk
            references user_agents,
    time            timestamp with time zone not null,
    country         varchar(2),
    instance        varchar(128)             not null
);

create
index sprax_api_time_idx
    on sprax_api (time);

create
index sprax_api_remote_addr_idx
    on sprax_api (remote_addr);

create
index sprax_api_status_idx
    on sprax_api (status);

create
index sprax_api_country_idx
    on sprax_api (country);

create
index sprax_api_instance_idx
    on sprax_api (instance);

create
unique index user_agents_name_uindex
    on user_agents (name);

create
index user_agents_name_idx
    on user_agents (name);