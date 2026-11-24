import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const fallbackAccessSecret = crypto.randomBytes(32).toString('hex');
const fallbackRefreshSecret = crypto.randomBytes(32).toString('hex');
const fallbackEmailSecret = crypto.randomBytes(32).toString('hex');
const fallbackResetSecret = crypto.randomBytes(32).toString('hex');

function cleanEnvValue(value?: string): string {
  return value ? value.trim().replace(/^['"]|['"]$/g, '').trim() : '';
}

function cleanBrevoApiKey(value?: string): string {
  return cleanEnvValue(value)
    .replace(/^BREVO_API_KEY\s*=\s*/i, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function cleanBaseUrl(value?: string): string {
  return cleanEnvValue(value).replace(/\/+$/, '');
}

export const env = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  mongodbUri: cleanEnvValue(process.env.MONGODB_URI),
  clientUrl: cleanBaseUrl(process.env.CLIENT_URL) || cleanBaseUrl(process.env.APP_URL) || 'http://localhost:3000',
  serverUrl: cleanBaseUrl(process.env.SERVER_URL) || cleanBaseUrl(process.env.APP_URL) || 'http://localhost:3000',
  jwtAccessSecret: cleanEnvValue(process.env.JWT_ACCESS_SECRET) || fallbackAccessSecret,
  jwtRefreshSecret: cleanEnvValue(process.env.JWT_REFRESH_SECRET) || fallbackRefreshSecret,
  emailVerificationSecret: cleanEnvValue(process.env.EMAIL_VERIFICATION_SECRET) || fallbackEmailSecret,
  passwordResetSecret: cleanEnvValue(process.env.PASSWORD_RESET_SECRET) || fallbackResetSecret,
  adminSetupPasscode: cleanEnvValue(process.env.ADMIN_SETUP_PASSCODE),
  cloudinaryCloudName: cleanEnvValue(process.env.CLOUDINARY_CLOUD_NAME),
  cloudinaryApiKey: cleanEnvValue(process.env.CLOUDINARY_API_KEY),
  cloudinaryApiSecret: cleanEnvValue(process.env.CLOUDINARY_API_SECRET),
  brevoApiKey: cleanBrevoApiKey(process.env.BREVO_API_KEY),
  brevoSenderEmail:
    cleanEnvValue(process.env.BREVO_SENDER_EMAIL).replace(/^BREVO_SENDER_EMAIL\s*=\s*/i, '').trim() ||
    'jobkarenge.support@gmail.com',
  brevoSenderName:
    cleanEnvValue(process.env.BREVO_SENDER_NAME).replace(/^BREVO_SENDER_NAME\s*=\s*/i, '').trim() || 'Job Karenge',
  brevoBaseUrl: cleanBaseUrl(process.env.BREVO_BASE_URL) || 'https://api.brevo.com/v3',
  brevoWebhookSecret: cleanEnvValue(process.env.BREVO_WEBHOOK_SECRET),
};

export const integrationStatus = {
  mongodbConfigured: Boolean(env.mongodbUri),
  cloudinaryConfigured: Boolean(env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret),
  brevoConfigured: Boolean(env.brevoApiKey),
};
