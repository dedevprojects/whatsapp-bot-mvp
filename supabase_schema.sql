-- ============================================================
-- Supabase SQL Schema for the Universal WhatsApp Bot Engine
-- Run this in your Supabase project → SQL Editor
-- ============================================================

create extension if not exists "uuid-ossp";

create table if not exists businesses (
  id               uuid primary key default uuid_generate_v4(),
  business_name    text        not null,
  description      text,
  whatsapp_number  text        not null unique,  -- E.164 e.g. +5491112345678
  welcome_message  text        not null default 'Hola 👋 ¿En qué te puedo ayudar?',
  menu_options     jsonb       not null default '{}',
  responses        jsonb       not null default '{}',
  active           boolean     not null default true,
  address          text,
  website          text,
  access_password  text,             -- Individual password for the client to see only their bot
  knowledge_base   text,             -- Detailed text for AI context (Bio, FAQ, etc.)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ============================================================
-- Messages log table (Optional but highly recommended)
-- ============================================================

create table if not exists messages (
  id               uuid primary key default uuid_generate_v4(),
  business_id      uuid        references businesses(id),
  sender_jid       text        not null,
  message_text     text,
  direction        text        not null check (direction in ('inbound', 'outbound')),
  created_at       timestamptz not null default now()
);

create index if not exists idx_messages_business on messages(business_id);
create index if not exists idx_messages_sender on messages(sender_jid);

-- Keep updated_at current automatically
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_businesses_updated_at on businesses;
create trigger trg_businesses_updated_at
  before update on businesses
  for each row execute function set_updated_at();

-- Index for fast lookups by phone number
create index if not exists idx_businesses_number on businesses(whatsapp_number);

-- ============================================================
-- Example record — Restaurante Roma
-- ============================================================

insert into businesses (
  business_name,
  description,
  whatsapp_number,
  welcome_message,
  menu_options,
  responses,
  address,
  website,
  access_password,
  knowledge_base
) values (
  'Restaurante Roma',
  'Un restaurante italiano tradicional que sirve pastas caseras y pizzas al horno de leña.',
  '+5491112345678',
  'Hola 👋 Bienvenido a Restaurante Roma 🍝',
  '{
    "1": "Ver menú",
    "2": "Reservar mesa",
    "3": "Horarios",
    "4": "Ubicación"
  }',
  '{
    "1": "Te paso nuestro menú 👉 https://menu.restauranteroma.com",
    "2": "¡Con gusto! Decime el día, hora y cantidad de personas para la reserva.",
    "3": "Abrimos de lunes a domingo de 12:00 a 23:00 hs 🕛",
    "4": "Estamos en Av. Siempre Viva 123, Ciudad 📍"
  }',
  'Av. Siempre Viva 123, Ciudad CP 1234',
  'https://restauranteroma.com',
  'roma123',
  'Somos un restaurante italiano con más de 20 años de experiencia. Nuestra especialidad es la Lasaña Romana y el Tiramisú casero. No cobramos derecho de cubierto. Tenemos opciones sin TACC. Aceptamos todas las tarjetas.'
) on conflict (whatsapp_number) do nothing;

-- Example record — Inmobiliaria Altos del Sur
insert into businesses (
  business_name,
  description,
  whatsapp_number,
  welcome_message,
  menu_options,
  responses,
  address,
  website,
  access_password,
  knowledge_base
) values (
  'Altos del Sur 🏘️ (Inmobiliaria)',
  'Líderes en ventas y alquileres en la zona sur. Tasaciones profesionales y asesoramiento integral.',
  '+5491100000004',
  '¡Hola! 👋 Gracias por contactarte con Altos del Sur Inmobiliaria. ¿Cómo podemos ayudarte con tu propiedad hoy?',
  '{
    "1": "Propiedades en Venta",
    "2": "Alquileres Disponibles",
    "3": "Tasación Gratis",
    "4": "Contacto Humano"
  }',
  '{
    "1": "Contamos con una amplia cartera de casas y departamentos. Decime: ¿Qué zona te interesa?",
    "2": "¡Genial! Buscas alquiler residencial o comercial?",
    "3": "Con gusto. Decime la dirección de la propiedad para programar una visita de tasación.",
    "4": "Te derivo con un asesor comercial en este momento. Aguarda un segundo."
  }',
  'Av. Belgrano 1200, Quilmes',
  'https://altosdelsur.com.ar',
  'altos77', 
  'Somos una inmobiliaria con 15 años de trayectoria. Trabajamos en Quilmes, Berazategui y Bernal. Horario de atención: Lunes a Viernes de 9 a 18hs.'
) on conflict (whatsapp_number) do nothing;

-- ============================================================
-- WhatsApp Sessions table (For persistence on Render/Railway)
-- ============================================================

create table if not exists whatsapp_sessions (
  id               uuid primary key default uuid_generate_v4(),
  whatsapp_number  text not null unique,
  data             jsonb not null,
  updated_at       timestamptz not null default now()
);

create index if not exists idx_sessions_number on whatsapp_sessions(whatsapp_number);

-- Trigger for sessions table
create trigger trg_whatsapp_sessions_updated_at
  before update on whatsapp_sessions
  for each row execute function set_updated_at();

-- ============================================================
-- Leads Capture Table
-- ============================================================

create table if not exists leads (
  id               uuid primary key default uuid_generate_v4(),
  business_name    text,
  contact_name     text,
  contact_number   text,
  interest_level   text default 'Low',
  created_at       timestamptz not null default now()
);

create index if not exists idx_leads_number on leads(contact_number);
