const xlsx = require('xlsx');

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '42b9b1907f1687cad3cfd7d05e679e38a961d3c1be58e6960d6d8e887cd739032d2302d3b58e1797c3ae8ccbdef8c39b74a87ccf57f5498e1f5a49635f01701e3e2a5ea8f2a3af096cabd443e2aff7ca4b694a24ec17cf98614f6449163247723820c13ef12b5defd6b33f87b3a07c7dca4ead7bfb5e112218fa797698af1ba7';
const FILE_PATH = '/Users/greck/Desktop/agraris/agraris-cms/scripts/export-products-29-03-26_02-25-56.xlsx';

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

        // Если mainImage уже есть — пропускаем
        if (product.mainImage && product.images && product.images.length > 0) {
            console.log(`↪ Already has gallery: ${title}`);
            skipped++;
            continue;
        }

        try {

            const galleryUrls = imageUrls.slice(1);
            const uploadedFiles = [];

            for (let i = 0; i < galleryUrls.length; i++) {
                const imageUrl = galleryUrls[i];
                const fileName = getFileNameFromUrl(imageUrl, `${product.slug}-gallery-${i + 1}.jpg`);

                const uploadedFile = await uploadImageFromUrl(imageUrl, fileName);

                if (uploadedFile) {
                    uploadedFiles.push(uploadedFile);
                }
            }

            if (!uploadedFiles.length) {
                console.log(`↪ No extra gallery images: ${title}`);
                skipped++;
                continue;
            }

            await updateProduct(product.documentId, {
                images: uploadedFiles.map((file) => file.id),
            });
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