/* ============================================================
   BACKEND DE DEMOSTRACIÓN (sin Supabase)
   ------------------------------------------------------------
   Simula el cliente de Supabase usando el localStorage del
   navegador. Se usa automáticamente cuando NO has puesto tus
   credenciales, para que puedas probar la app tal cual.

   Acceso en modo demo:
     Usuario:    admin
     Contraseña: Admin1234

   Los datos se guardan SOLO en tu navegador (no hay servidor).
   Al poner tus credenciales reales en script.js, este modo se
   desactiva solo.
   ============================================================ */
(function () {
  const PREFIJO = "demo_";
  const VERSION = "3"; // súbelo si cambias la estructura para reiniciar datos

  /* Credenciales de acceso del modo demo */
  const CRED_USUARIO = "admin";
  const CRED_PASSWORD = "Admin1234";

  const uuid = () =>
    (crypto.randomUUID && crypto.randomUUID()) ||
    "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);

  /* Lee/escribe una "tabla" en localStorage */
  function leer(tabla) {
    try { return JSON.parse(localStorage.getItem(PREFIJO + tabla)) || []; }
    catch { return []; }
  }
  function escribir(tabla, filas) {
    localStorage.setItem(PREFIJO + tabla, JSON.stringify(filas));
  }

  /* Inicializa las tablas VACÍAS la primera vez (o al subir VERSION) */
  function inicializar() {
    if (localStorage.getItem(PREFIJO + "v") !== VERSION) {
      escribir("inquilinos", []);
      escribir("pagos", []);
      localStorage.setItem(PREFIJO + "v", VERSION);
    }
  }

  /* Constructor de consultas encadenables y "esperables" (await) */
  class Consulta {
    constructor(tabla) {
      this.tabla = tabla;
      this.op = "select";
      this.filtros = [];
      this.ordenes = [];
      this.payload = null;
      this.onConflict = null;
    }
    select() { this.op = "select"; return this; }
    insert(filas) { this.op = "insert"; this.payload = filas; return this; }
    update(obj) { this.op = "update"; this.payload = obj; return this; }
    upsert(obj, opts) { this.op = "upsert"; this.payload = obj; this.onConflict = opts && opts.onConflict; return this; }
    delete() { this.op = "delete"; return this; }
    eq(col, val) { this.filtros.push([col, val]); return this; }
    order(col, opts) { this.ordenes.push([col, !opts || opts.ascending !== false]); return this; }

    /* Hace la consulta "await-able": devuelve { data, error } */
    then(resolve) { resolve(this.ejecutar()); }

    coincide(fila) {
      return this.filtros.every(([c, v]) => String(fila[c]) === String(v));
    }

    ejecutar() {
      try {
        let filas = leer(this.tabla);

        if (this.op === "select") {
          let res = filas.filter((f) => this.coincide(f));
          for (const [col, asc] of this.ordenes) {
            res.sort((a, b) => {
              if (a[col] < b[col]) return asc ? -1 : 1;
              if (a[col] > b[col]) return asc ? 1 : -1;
              return 0;
            });
          }
          return { data: res, error: null };
        }

        if (this.op === "insert") {
          const nuevas = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({
            id: uuid(), user_id: "demo", creado_en: new Date().toISOString(), ...r,
          }));
          escribir(this.tabla, filas.concat(nuevas));
          return { data: nuevas, error: null };
        }

        if (this.op === "update") {
          filas = filas.map((f) => (this.coincide(f) ? { ...f, ...this.payload } : f));
          escribir(this.tabla, filas);
          return { data: null, error: null };
        }

        if (this.op === "upsert") {
          const claves = (this.onConflict || "").split(",").map((s) => s.trim());
          const igual = (a, b) => claves.every((k) => String(a[k]) === String(b[k]));
          const idx = filas.findIndex((f) => igual(f, this.payload));
          if (idx >= 0) filas[idx] = { ...filas[idx], ...this.payload };
          else filas.push({ id: uuid(), user_id: "demo", creado_en: new Date().toISOString(), ...this.payload });
          escribir(this.tabla, filas);
          return { data: null, error: null };
        }

        if (this.op === "delete") {
          escribir(this.tabla, filas.filter((f) => !this.coincide(f)));
          return { data: null, error: null };
        }

        return { data: null, error: null };
      } catch (e) {
        return { data: null, error: { message: e.message } };
      }
    }
  }

  /* --------------------------------------------------------
     Autenticación simulada con usuario/contraseña fijos
     -------------------------------------------------------- */
  const sesionDemo = { user: { email: CRED_USUARIO } };

  function haySesion() {
    return localStorage.getItem(PREFIJO + "sesion") === "1";
  }

  const auth = {
    _cb: null,

    async getSession() {
      return { data: { session: haySesion() ? sesionDemo : null } };
    },

    onAuthStateChange(cb) {
      this._cb = cb;
      setTimeout(() => {
        cb(haySesion() ? "SIGNED_IN" : "SIGNED_OUT", haySesion() ? sesionDemo : null);
      }, 0);
      return { data: { subscription: { unsubscribe() {} } } };
    },

    async signInWithPassword({ email, password }) {
      const usuario = (email || "").trim();
      if (usuario.toLowerCase() === CRED_USUARIO && password === CRED_PASSWORD) {
        localStorage.setItem(PREFIJO + "sesion", "1");
        if (this._cb) this._cb("SIGNED_IN", sesionDemo);
        return { data: { session: sesionDemo }, error: null };
      }
      return { data: { session: null }, error: { message: "Usuario o contraseña incorrectos." } };
    },

    async signUp() {
      return {
        data: { session: null },
        error: { message: 'Modo demo: entra con el usuario "admin".' },
      };
    },

    async signOut() {
      localStorage.removeItem(PREFIJO + "sesion");
      if (this._cb) this._cb("SIGNED_OUT", null);
      return { error: null };
    },
  };

  /* Cliente demo expuesto para script.js */
  window.crearClienteDemo = function () {
    inicializar();
    return {
      esDemo: true,
      auth,
      from: (tabla) => new Consulta(tabla),
    };
  };
})();
