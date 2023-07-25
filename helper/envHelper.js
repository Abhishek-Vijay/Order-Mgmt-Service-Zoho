'use strict'
const { get } = require('lodash');
const env = get(process, 'env');

const envVariables = {
    TOKEN: get(env, 'TOKEN') || '13516813516.fwufywv.scbweiochnw',
    ORGANIZATION_ID: get(env, 'ORGANIZATION_ID') || '60020823522',
    CLIENT_ID: get(env, 'CLIENT_ID') || '1000.F5SXT96LTYLGTH1KIEAP3RRQW3NF9Y',
    CLIENT_SECRET: get(env, 'CLIENT_SECRET') || 'c59989b20b948e43cc2dd9f96c3277e5619f281fe7',
    CODE: get(env, 'CODE') || '1000.33296dbbb2dc4f2c6b5c524d0a9e79bb.ad2e2b4a80c48a768e5e110fc6233b64',
    PAYMENT_GATEWAY: get(env, 'PAYMENT_GATEWAY') || 'razorpay',
    REGION: get(env, 'REGION') || 'ap-south-1',
    INVOICE_QUEUE_URL: get(env, 'INVOICE_QUEUE_URL') || 'https://sqs.ap-south-1.amazonaws.com/315872761357/local-uc-invoice-generation',
    PERSON_QUEUE_URL: get(env, 'PERSON_QUEUE_URL') || 'https://sqs.ap-south-1.amazonaws.com/315872761357/local-uc-clinical-person-info',
    DB: {
        POSTGRES_USER: get(env, 'POSTGRES_USER') || 'postgres',
        POSTGRES_HOST: get(env, 'POSTGRES_HOST') || 'localhost',
        POSTGRES_DATABASE: get(env, 'POSTGRES_DATABASE') || 'postgres',
        POSTGRES_PASSWORD: get(env, 'POSTGRES_PASSWORD') || 'postgres',
        POSTGRES_PORT: get(env, 'POSTGRES_PORT') || 5432
    },
    REFRESH_TOKEN: get(env, 'REFRESH_TOKEN') || '1000.d5b444e911fc5307d64da689fee96e21.5008e56f288dede03b8150beed3c5da4',
    APP_SERVER_PORT: get(env, 'APP_SERVER_PORT') || 5000
}

module.exports = envVariables;