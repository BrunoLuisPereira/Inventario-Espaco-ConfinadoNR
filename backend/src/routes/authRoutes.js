const express = require("express");
const authController = require("../controllers/authController");
const {
  autenticar,
} = require("../middlewares/autenticacaoMiddleware");

const router = express.Router();

router.post("/login", authController.login);

router.get("/me", autenticar, (req, res) => {
  return res.status(200).json({
    status: "success",
    message: "Usuário autenticado.",
    data: req.usuario,
  });
});

module.exports = router;