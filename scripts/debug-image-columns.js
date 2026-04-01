const xlsx = require('xlsx');

const FILE_PATH = '/Users/greck/Desktop/agraris/agraris-cms/scripts/export-products-29-03-26_02-25-56.xlsx';

const workbook = xlsx.readFile(FILE_PATH);
const sheet = workbook.Sheets['Export Products Sheet'];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

const firstRow = rows[0];

const imageLikeKeys = Object.keys(firstRow).filter((key) => {
    const k = key.toLowerCase();
    return (
        k.includes('изображ') ||
        k.includes('картин') ||
        k.includes('фото') ||
        k.includes('image') ||
        k.includes('img')
    );
});

console.log(imageLikeKeys);