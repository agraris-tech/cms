const xlsx = require('xlsx');

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '2c47d8f2c579d9c64e5e7c4a66a7eacb75b34f870ea9353452eab5b4dd124254b0ea033c363fb53f7eff77a09c28a895d600ef0abfb679bd3ff352eb85d0f21a65f803c10b662c13d0b8e9d45e1f7695f545f7436f6174d9879f54573d37545583fa0387f53640acd6d88f661fcef8b4c3c7426e3376a65519dad95fc3c9aad5';
const FILE_PATH = '/Users/greck/Desktop/AgrarisFinal/cms/scripts/export-products-29-03-26_02-25-56.xlsx';

function normalizeText(value) {
    return String(value || '').trim();
}

async function strapiRequest(path, options = {}) {
    const res = await fetch(`${STRAPI_URL}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${STRAPI_API_TOKEN}`,
            ...(options.headers || {}),
        },
    });

    const text = await res.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }

    if (!res.ok) {
        throw new Error(
            `Request failed: ${res.status} ${res.statusText}\n${JSON.stringify(data, null, 2)}`
        );
    }

    return data;
}

async function getAllProducts() {
    let page = 1;
    let pageCount = 1;
    const results = [];

    while (page <= pageCount) {
        const json = await strapiRequest(
            `/api/products?pagination[page]=${page}&pagination[pageSize]=100`
        );

        const data = json.data || [];
        const pagination = json.meta?.pagination;

        results.push(...data);
        pageCount = pagination?.pageCount || 1;
        page++;
    }

    return results;
}

async function uploadImageFromUrl(imageUrl, fileName) {
    const imageRes = await fetch(imageUrl);

    if (!imageRes.ok) {
        throw new Error(`Failed to download image: ${imageUrl}`);
    }

    const arrayBuffer = await imageRes.arrayBuffer();
    const contentType = imageRes.headers.get('content-type') || 'image/jpeg';

    const blob = new Blob([arrayBuffer], { type: contentType });
    const formData = new FormData();

    formData.append('files', blob, fileName);

    const res = await fetch(`${STRAPI_URL}/api/upload`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${STRAPI_API_TOKEN}`,
        },
        body: formData,
    });

    const text = await res.text();
    let data = {};

    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text };
    }

    if (!res.ok) {
        throw new Error(
            `Upload failed: ${res.status} ${res.statusText}\n${JSON.stringify(data, null, 2)}`
        );
    }

    return Array.isArray(data) ? data[0] : null;
}

async function updateProduct(documentId, payload) {
    return strapiRequest(`/api/products/${documentId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: payload }),
    });
}

function getImageUrls(rawValue) {
    const value = normalizeText(rawValue);
    if (!value) return [];

    return value
        .split(/[\n,;]/)
        .map((url) => url.trim())
        .filter((url) => url.startsWith('http'));
}

function getFileNameFromUrl(url, fallback = 'product-image.jpg') {
    try {
        const pathname = new URL(url).pathname;
        const lastPart = pathname.split('/').pop();
        return lastPart || fallback;
    } catch {
        return fallback;
    }
}

async function main() {
    console.log('📘 Reading XLSX...');
    const workbook = xlsx.readFile(FILE_PATH);
    const sheet = workbook.Sheets['Export Products Sheet'];

    if (!sheet) {
        throw new Error('Sheet "Export Products Sheet" not found.');
    }

    const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });
    console.log(`Rows: ${rows.length}`);

    const products = await getAllProducts();

    const productBySku = new Map();
    const productBySourceUrl = new Map();
    const productByTitle = new Map();

    for (const product of products) {
        const sku = normalizeText(product.sku);
        const sourceUrl = normalizeText(product.sourceUrl);
        const title = normalizeText(product.title).toLowerCase();

        if (sku) productBySku.set(sku, product);
        if (sourceUrl) productBySourceUrl.set(sourceUrl, product);

        if (title) {
            if (!productByTitle.has(title)) {
                productByTitle.set(title, []);
            }
            productByTitle.get(title).push(product);
        }
    }

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
        const title = normalizeText(row['Название_позиции']);
        const sku = normalizeText(row['Код_товара']);
        const sourceUrl = normalizeText(row['Продукт_на_сайте']);
        const imageUrls = getImageUrls(row['Ссылка_изображения']);

        if (!imageUrls.length) {
            skipped++;
            continue;
        }

        let product = null;

        if (sku && productBySku.has(sku)) {
            product = productBySku.get(sku);
        } else if (sourceUrl && productBySourceUrl.has(sourceUrl)) {
            product = productBySourceUrl.get(sourceUrl);
        } else if (title) {
            const candidates = productByTitle.get(title.toLowerCase()) || [];
            if (candidates.length === 1) {
                product = candidates[0];
            }
        }

        if (!product) {
            console.log(`⚠️ Product not found: ${title}`);
            skipped++;
            continue;
        }

        try {
            // Берем первую ссылку для главного фото
            const mainImageUrl = imageUrls[0];
            // Остальные берем для галереи
            const galleryUrls = imageUrls.slice(1);

            const payload = {};

            // 1. Загружаем главную картинку (mainImage)
            if (mainImageUrl) {
                const mainImageFileName = getFileNameFromUrl(mainImageUrl, `${product.slug || 'product'}-main.jpg`);
                const mainImageFile = await uploadImageFromUrl(mainImageUrl, mainImageFileName);
                if (mainImageFile) {
                    payload.mainImage = mainImageFile.id;
                }
            }

            // 2. Загружаем галерею (images)
            const uploadedGalleryFiles = [];
            for (let i = 0; i < galleryUrls.length; i++) {
                const imageUrl = galleryUrls[i];
                const fileName = getFileNameFromUrl(imageUrl, `${product.slug || 'product'}-gallery-${i + 1}.jpg`);

                const uploadedFile = await uploadImageFromUrl(imageUrl, fileName);

                if (uploadedFile) {
                    uploadedGalleryFiles.push(uploadedFile);
                }
            }

            if (uploadedGalleryFiles.length > 0) {
                payload.images = uploadedGalleryFiles.map((file) => file.id);
            }

            // Если ничего не загрузилось, пропускаем
            if (Object.keys(payload).length === 0) {
                console.log(`↪ No images to update: ${title}`);
                skipped++;
                continue;
            }

            // Обновляем продукт в Strapi сразу двумя полями
            await updateProduct(product.documentId, payload);
            console.log(`✅ Updated images for: ${title}`);
            updated++;
        } catch (error) {
            console.error(`❌ Failed image import: ${title}`);
            console.error(error.message);
            failed++;
        }
    }

    console.log('🎉 Product image import finished.');
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Failed: ${failed}`);
}

main().catch((err) => {
    console.error('❌ Script failed');
    console.error(err);
    process.exit(1);
});