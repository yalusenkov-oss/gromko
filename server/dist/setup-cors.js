import 'dotenv/config';
import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'ru-central1',
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY,
        secretAccessKey: process.env.S3_SECRET_KEY,
    },
    forcePathStyle: true,
});
await s3.send(new PutBucketCorsCommand({
    Bucket: process.env.S3_CDN_BUCKET || 'musicpfvlisten',
    CORSConfiguration: {
        CORSRules: [
            {
                AllowedOrigins: ['*'],
                AllowedMethods: ['GET', 'HEAD'],
                AllowedHeaders: ['*'],
                ExposeHeaders: ['Content-Length', 'Content-Type', 'Accept-Ranges', 'Content-Range'],
                MaxAgeSeconds: 86400,
            },
        ],
    },
}));
console.log('✅ CORS configured on S3 bucket');
//# sourceMappingURL=setup-cors.js.map