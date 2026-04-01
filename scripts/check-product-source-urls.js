const STRAPI_URL = process.env.STRAPI_URL || 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN || '42b9b1907f1687cad3cfd7d05e679e38a961d3c1be58e6960d6d8e887cd739032d2302d3b58e1797c3ae8ccbdef8c39b74a87ccf57f5498e1f5a49635f01701e3e2a5ea8f2a3af096cabd443e2aff7ca4b694a24ec17cf98614f6449163247723820c13ef12b5defd6b33f87b3a07c7dca4ead7bfb5e112218fa797698af1ba7';

function normalizeText(value) {
    return String(value || '').trim();
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
    return getAllEntries('/api/products');
}

async function main() {
    const products = await getAllProducts();

    const withSourceUrl = products.filter((p) => normalizeText(p.sourceUrl));
    const withoutSourceUrl = products.filter((p) => !normalizeText(p.sourceUrl));

    console.log(`Total products: ${products.length}`);
    console.log(`With sourceUrl: ${withSourceUrl.length}`);
    console.log(`Without sourceUrl: ${withoutSourceUrl.length}`);

    console.log('\nFirst 20 without sourceUrl:');
    withoutSourceUrl.slice(0, 20).forEach((p) => {
        console.log(`- ${p.title}`);
    });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});