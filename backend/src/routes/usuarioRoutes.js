const express = require("express");
const usuarioController = require("../controllers/usuarioController");

const router = express.Router();

router.post("/", usuarioController.criar);

module.exports = router;