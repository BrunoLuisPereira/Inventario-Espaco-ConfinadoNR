// Preserva os endpoints já montados e reutiliza os handlers multi-tenant.
// O router multi-tenant separado permanece sem montagem na aplicação.
module.exports = require("./campanhaMultiTenantController");
