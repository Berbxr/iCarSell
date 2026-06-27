require('dotenv').config();
const crearApp = require('./app');

const PORT = process.env.PORT || 4000;
const app = crearApp();

app.listen(PORT, () => {
  console.log(`iCarSell backend escuchando en http://localhost:${PORT}`);
});
