import type { Core } from '@strapi/strapi';

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  {
    name: 'strapi::cors',
    config: {
      origin: [
        // local dev
        'http://localhost:3000',
        'http://localhost:5173',

        // vercel preview
        /\.vercel\.app$/,

        // future production domains
        'https://agraris.ru',
        'https://www.agraris.ru',

        'https://agraris.tech',
        'https://www.agraris.tech',

        'https://agraristech.by',
        'https://www.agraristech.by',
      ],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization', 'Origin', 'Accept'],
      credentials: true,
    },
  },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;