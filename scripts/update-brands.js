const slugify = require('slugify');

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '2c47d8f2c579d9c64e5e7c4a66a7eacb75b34f870ea9353452eab5b4dd124254b0ea033c363fb53f7eff77a09c28a895d600ef0abfb679bd3ff352eb85d0f21a65f803c10b662c13d0b8e9d45e1f7695f545f7436f6174d9879f54573d37545583fa0387f53640acd6d88f661fcef8b4c3c7426e3376a65519dad95fc3c9aad5';

function makeSlug(value) {
    return slugify(String(value || ''), {
        lower: true,
        strict: true,
        locale: 'ru',
        trim: true,
    });
}


async function getAllEntries(basePath) {
    let page = 1;
    let pageCount = 1;
    const results = [];

    while (page <= pageCount) {
        const separator = basePath.includes('?') ? '&' : '?';
        const path = `${basePath}${separator}pagination[page]=${page}&pagination[pageSize]=100`;

        const json = await strapiRequest(path);
        const data = json.data || [];
        const pagination = json.meta?.pagination;

        results.push(...data);

        pageCount = pagination?.pageCount || 1;
        page++;
    }

    return results;
}

async function strapiRequest(path, options = {}) {
    const res = await fetch(`${STRAPI_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${STRAPI_API_TOKEN}`,
            ...(options.headers || {}),
        },
    });

    const data = await res.json();

    if (!res.ok) {
        throw new Error(JSON.stringify(data, null, 2));
    }

    return data;
}

async function getAllBrands() {
    return getAllEntries('/api/brands');
}

async function getAllProducts() {
    return getAllEntries('/api/products?populate=brand')
}

async function updateBrand(documentId, payload) {
    return strapiRequest(`/api/brands/${documentId}`, {
        method: 'PUT',
        body: JSON.stringify({ data: payload }),
    });
}

async function main() {
    console.log('📦 Loading brands & products...');

    const [brands, products] = await Promise.all([
        getAllBrands(),
        getAllProducts(),
    ]);

    console.log(`Brands: ${brands.length}`);
    console.log(`Products: ${products.length}`);

    // 👉 считаем сколько товаров у каждого бренда
    const productCountByBrand = {};

    for (const product of products) {
        if (!product.brand) continue;
        if (!product.isActive) continue;

        const brandId = product.brand.documentId;

        if (!productCountByBrand[brandId]) {
            productCountByBrand[brandId] = 0;
        }

        productCountByBrand[brandId]++;
    }

    let updated = 0;

    for (const brand of brands) {
        const brandId = brand.documentId;
        const brandName = brand.name;

        const hasProducts = productCountByBrand[brandId] > 0;

        const slug = makeSlug(brandName);

        const payload = {
            slug,
            isActive: hasProducts,
        };

        try {
            await updateBrand(brandId, payload);

            console.log(
                `✅ ${brandName} → slug: ${slug}, active: ${hasProducts}`
            );

            updated++;
        } catch (err) {
            console.error(`❌ Failed: ${brandName}`);
            console.error(err.message);
        }
    }

    console.log('🎉 Done updating brands');
    console.log(`Updated: ${updated}`);
}

main().catch((err) => {
    console.error('❌ Script failed');
    console.error(err);
});