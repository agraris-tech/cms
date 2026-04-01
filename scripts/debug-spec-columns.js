const xlsx = require('xlsx');

const FILE_PATH = '/Users/greck/Desktop/agraris/agraris-cms/scripts/export-products-29-03-26_02-25-56.xlsx';

const workbook = xlsx.readFile(FILE_PATH);
const sheet = workbook.Sheets['Export Products Sheet'];
const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

const firstRow = rows[0];

console.log(Object.keys(firstRow).filter((key) =>
    key.toLowerCase().includes('характерист')
));