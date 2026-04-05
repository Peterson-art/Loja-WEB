const express = require("express");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const PORT = process.env.PORT || 3000;

const db = new sqlite3.Database("./truetech.db");

const uploadsDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function isAdminEmail(email) {
  return email === "admin@truetech.com";
}

function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        senha TEXT NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        descricao TEXT NOT NULL,
        preco REAL NOT NULL,
        imagem TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_nome TEXT NOT NULL,
        user_email TEXT NOT NULL,
        itens TEXT NOT NULL,
        total REAL NOT NULL,
        status TEXT NOT NULL DEFAULT 'pendente',
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.get(`SELECT COUNT(*) AS total FROM products`, [], (err, row) => {
      if (err) {
        console.error("Erro ao contar produtos:", err);
        return;
      }

      if (row.total === 0) {
        const stmt = db.prepare(`
          INSERT INTO products (nome, descricao, preco, imagem)
          VALUES (?, ?, ?, ?)
        `);

        stmt.run(
          "Fone Bluetooth Premium",
          "Som limpo, conexão rápida e bateria duradoura para o dia a dia.",
          99.90,
          "https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=900&q=80"
        );

        stmt.run(
          "Mouse Gamer RGB",
          "Precisão, conforto e visual moderno para setup gamer ou trabalho.",
          79.90,
          "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=900&q=80"
        );

        stmt.run(
          "Teclado Mecânico LED",
          "Digitação confortável, resposta rápida e iluminação elegante.",
          129.90,
          "https://images.unsplash.com/photo-1511467687858-23d96c32e4ae?auto=format&fit=crop&w=900&q=80"
        );

        stmt.finalize();
      }
    });
  });
}

app.post("/api/register", async (req, res) => {
  try {
    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ erro: "Preencha todos os campos." });
    }

    if (senha.length < 6) {
      return res.status(400).json({ erro: "A senha deve ter pelo menos 6 caracteres." });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    db.run(
      `INSERT INTO users (nome, email, senha) VALUES (?, ?, ?)`,
      [nome, email, senhaHash],
      function (err) {
        if (err) {
          if (err.message.includes("UNIQUE")) {
            return res.status(400).json({ erro: "Este e-mail já está cadastrado." });
          }
          return res.status(500).json({ erro: "Erro ao criar conta." });
        }

        res.json({
          mensagem: "Conta criada com sucesso.",
          usuario: {
            id: this.lastID,
            nome,
            email,
            isAdmin: isAdminEmail(email)
          }
        });
      }
    );
  } catch {
    res.status(500).json({ erro: "Erro interno no servidor." });
  }
});

app.post("/api/login", (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ erro: "Preencha e-mail e senha." });
  }

  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err) {
      return res.status(500).json({ erro: "Erro ao buscar usuário." });
    }

    if (!user) {
      return res.status(400).json({ erro: "Usuário não encontrado." });
    }

    const senhaCorreta = await bcrypt.compare(senha, user.senha);

    if (!senhaCorreta) {
      return res.status(400).json({ erro: "Senha incorreta." });
    }

    res.json({
      mensagem: "Login realizado com sucesso.",
      usuario: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        isAdmin: isAdminEmail(user.email)
      }
    });
  });
});

app.get("/api/products", (req, res) => {
  db.all(`SELECT * FROM products ORDER BY id DESC`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ erro: "Erro ao listar produtos." });
    }
    res.json(rows);
  });
});

app.post("/api/products", upload.single("imagemArquivo"), (req, res) => {
  const { nome, descricao, preco, imagem } = req.body;

  if (!nome || !descricao || !preco) {
    return res.status(400).json({ erro: "Preencha nome, descrição e preço." });
  }

  let imagemFinal = imagem || "https://via.placeholder.com/400x220?text=Produto";

  if (req.file) {
    imagemFinal = `/uploads/${req.file.filename}`;
  }

  db.run(
    `INSERT INTO products (nome, descricao, preco, imagem) VALUES (?, ?, ?, ?)`,
    [nome, descricao, Number(preco), imagemFinal],
    function (err) {
      if (err) {
        return res.status(500).json({ erro: "Erro ao cadastrar produto." });
      }

      res.json({
        mensagem: "Produto cadastrado com sucesso.",
        produto: {
          id: this.lastID,
          nome,
          descricao,
          preco: Number(preco),
          imagem: imagemFinal
        }
      });
    }
  );
});

app.put("/api/products/:id", upload.single("imagemArquivo"), (req, res) => {
  const { id } = req.params;
  const { nome, descricao, preco, imagemAtual, imagem } = req.body;

  if (!nome || !descricao || !preco) {
    return res.status(400).json({ erro: "Preencha nome, descrição e preço." });
  }

  let imagemFinal = imagem || imagemAtual || "https://via.placeholder.com/400x220?text=Produto";

  if (req.file) {
    imagemFinal = `/uploads/${req.file.filename}`;
  }

  db.run(
    `UPDATE products SET nome = ?, descricao = ?, preco = ?, imagem = ? WHERE id = ?`,
    [nome, descricao, Number(preco), imagemFinal, id],
    function (err) {
      if (err) {
        return res.status(500).json({ erro: "Erro ao editar produto." });
      }

      if (this.changes === 0) {
        return res.status(404).json({ erro: "Produto não encontrado." });
      }

      res.json({ mensagem: "Produto atualizado com sucesso." });
    }
  );
});

app.delete("/api/products/:id", (req, res) => {
  const { id } = req.params;

  db.run(`DELETE FROM products WHERE id = ?`, [id], function (err) {
    if (err) {
      return res.status(500).json({ erro: "Erro ao excluir produto." });
    }

    if (this.changes === 0) {
      return res.status(404).json({ erro: "Produto não encontrado." });
    }

    res.json({ mensagem: "Produto excluído com sucesso." });
  });
});

app.post("/api/orders", (req, res) => {
  const { user_nome, user_email, itens, total } = req.body;

  if (!user_nome || !user_email || !itens || !Array.isArray(itens) || itens.length === 0 || !total) {
    return res.status(400).json({ erro: "Pedido inválido." });
  }

  db.run(
    `INSERT INTO orders (user_nome, user_email, itens, total, status) VALUES (?, ?, ?, ?, ?)`,
    [user_nome, user_email, JSON.stringify(itens), Number(total), "pendente"],
    function (err) {
      if (err) {
        return res.status(500).json({ erro: "Erro ao salvar pedido." });
      }

      res.json({
        mensagem: "Pedido salvo com sucesso.",
        pedidoId: this.lastID
      });
    }
  );
});

app.get("/api/orders", (req, res) => {
  db.all(`SELECT * FROM orders ORDER BY id DESC`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ erro: "Erro ao listar pedidos." });
    }

    const pedidos = rows.map(p => ({
      ...p,
      itens: JSON.parse(p.itens)
    }));

    res.json(pedidos);
  });
});

app.put("/api/orders/:id/status", (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const permitidos = ["pendente", "pago", "enviado"];

  if (!permitidos.includes(status)) {
    return res.status(400).json({ erro: "Status inválido." });
  }

  db.run(
    `UPDATE orders SET status = ? WHERE id = ?`,
    [status, id],
    function (err) {
      if (err) {
        return res.status(500).json({ erro: "Erro ao atualizar status." });
      }

      if (this.changes === 0) {
        return res.status(404).json({ erro: "Pedido não encontrado." });
      }

      res.json({ mensagem: "Status atualizado com sucesso." });
    }
  );
});

initDb();

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});