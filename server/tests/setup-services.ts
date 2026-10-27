// For `npm run test:all`: point the integration suites at the docker compose services
// (`docker compose up -d redis mongo`). Redis DB 15 and a separate MongoDB database keep
// test data away from the app's own data.
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379/15';
process.env.MONGO_URL ??= 'mongodb://127.0.0.1:27018/flash_sale_test';
