const slugify = require('slugify');

const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '42b9b1907f1687cad3cfd7d05e679e38a961d3c1be58e6960d6d8e887cd739032d2302d3b58e1797c3ae8ccbdef8c39b74a87ccf57f5498e1f5a49635f01701e3e2a5ea8f2a3af096cabd443e2aff7ca4b694a24ec17cf98614f6449163247723820c13ef12b5defd6b33f87b3a07c7dca4ead7bfb5e112218fa797698af1ba7';

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