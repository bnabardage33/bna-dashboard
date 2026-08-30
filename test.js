const formData = { pu_ht: 48.4 };
const val = ((parseFloat(String(formData.pu_ht).replace(',', '.')) || 0) * 1.2).toFixed(2);
console.log(val);
