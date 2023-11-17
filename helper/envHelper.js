'use strict'
const { get } = require('lodash');
const env = get(process, 'env');

const envVariables = {
    TOKEN: get(env, 'TOKEN') || '13516813516.fwufywv.scbweiochnw',
    ORGANIZATION_ID: get(env, 'ORGANIZATION_ID') || '60020823522',
    CLIENT_ID: get(env, 'CLIENT_ID') || '1000.F5SXT96LTYLGTH1KIEAP3RRQW3NF9Y',
    CLIENT_SECRET: get(env, 'CLIENT_SECRET') || 'c59989b20b948e43cc2dd9f96c3277e5619f281fe7',
    CODE: get(env, 'CODE') || '1000.78f5d3cc1a20323863822994d41405cb.afe4d8f617a18685253eeeb04f86c2c3',
    PAYMENT_GATEWAY: get(env, 'PAYMENT_GATEWAY') || 'razorpay',
    BILLING_CLIENT_ID:get(env, 'BILLING_CLIENT_ID') || '1000.X84CRC9OL870OQM12BW455QY6OLCAO',
    BILLING_CLIENT_SECRET:get(env, 'BILLING_CLIENT_SECRET') || '917b24a38df1f4f5ebaa58c133496122ae4346ad71',
    BILLING_REFRESH_TOKEN:get(env, 'BILLING_REFRESH_TOKEN') || '1000.72abeb2bce9b500732d94e006110056c.6759989339b9ca7e5624d63f6cfd6805',
    BILLING_ORGANIZATION_ID:get(env, 'BILLING_ORGANIZATION_ID') || '60025084079',
    REGION: get(env, 'REGION') || 'ap-south-1',
    S3_BUCKET: get(env, 'S3_BUCKET') || 'urban-care-documents',
    S3_FOLDER: get(env, 'S3_FOLDER') || 'patient-invoice',
    DEPLOYMENT_ENV: get(env, 'DEPLOYMENT_ENV') || 'dev',
    INVOICE_QUEUE_URL: get(env, 'INVOICE_QUEUE_URL') || 'https://sqs.ap-south-1.amazonaws.com/315872761357/local-uc-invoice-generation',
    PERSON_QUEUE_URL: get(env, 'PERSON_QUEUE_URL') || 'https://sqs.ap-south-1.amazonaws.com/315872761357/local-uc-clinical-person-info',
    DB: {
        POSTGRES_USER: get(env, 'POSTGRES_USER') || 'postgres',
        POSTGRES_HOST: get(env, 'POSTGRES_HOST') || 'localhost',
        POSTGRES_DATABASE: get(env, 'POSTGRES_DATABASE') || 'zohoBooks',
        POSTGRES_PASSWORD: get(env, 'POSTGRES_PASSWORD') || 'root',
        POSTGRES_PORT: get(env, 'POSTGRES_PORT') || 5432
    },
    // changed the scope to "ZohoBooks.invoices.CREATE ZohoBooks.invoices.READ ZohoBooks.invoices.UPDATE ZohoBooks.invoices.DELETE ZohoBooks.contacts.CREATE ZohoBooks.contacts.UPDATE ZohoBooks.contacts.READ ZohoBooks.contacts.DELETE ZohoBooks.settings.READ"
    REFRESH_TOKEN: get(env, 'REFRESH_TOKEN') || '1000.de4126219e912993637ac3ca11e4d4b9.cc4c947b9cc7284ca84d69b8892c2af6',
    APP_SERVER_PORT: get(env, 'APP_SERVER_PORT') || 5000
}

module.exports = envVariables;