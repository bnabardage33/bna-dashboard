const formData = { pu_ht: "48,4" };
console.log(((parseFloat(String(formData.pu_ht).replace(',', '.')) || 0) * 1.2).toFixed(2));
