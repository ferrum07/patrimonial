/* ============================================================
   BACKEND DE DEMOSTRACIÓN (sin Supabase)
   ------------------------------------------------------------
   Simula el cliente de Supabase usando el localStorage del
   navegador. Se usa automáticamente cuando NO has puesto tus
   credenciales, para que puedas probar la app tal cual.

   Los datos se guardan SOLO en tu navegador (no hay servidor).
   Al poner tus credenciales reales en script.js, este modo se
   desactiva solo.
   ============================================================ */
(function () {
  const PREFIJO = "demo_";
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

  /* Datos de ejemplo la primera vez */
  function sembrar() {
    if (localStorage.getItem(PREFIJO + "sembrado")) return;
    escribir("inquilinos", [
      { id: uuid(), user_id: "demo", nombre: "Ana García",  correo: "ana@correo.com",  telefono: "600 111 222", importe: 750, dia_cobro: 1,  pagado: true,  fecha_pago: new Date().toISOString(), creado_en: new Date().toISOString() },
      { id: uuid(), user_id: "demo", nombre: "Luis Pérez",  correo: "luis@correo.com", telefono: "600 333 444", importe: 620, dia_cobro: 5,  pagado: false, fecha_pago: null, creado_en: new Date().toISOString() },
      { id: uuid(), user_id: "demo", nombre: "Marta Ruiz",  correo: "marta@correo.com",telefono: "600 555 666", importe: 900, dia_cobro: 10, pagado: false, fecha_pago: null, creado_en: new Date().toISOString() },
    ]);
    escribir("pagos", []);
    localStorage.setItem(PREFIJO + "sembrado", "1");
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

  /* Sesión y auth simuladas: siempre "logueado" como usuario demo */
  const sesionDemo = { user: { email: "demo@local (modo prueba)" } };

  const auth = {
    _cb: null,
    async getSession() { return { data: { session: sesionDemo } }; },
    onAuthStateChange(cb) {
      this._cb = cb;
      setTimeout(() => cb("SIGNED_IN", sesionDemo), 0);
      return { data: { subscription: { unsubscribe() {} } } };
    },
    async signInWithPassword() { return { data: { session: sesionDemo }, error: null }; },
    async signUp() { return { data: { session: sesionDemo }, error: null }; },
    async signOut() {
      // En demo no cerramos sesión de verdad (no hay a dónde ir); recargamos.
      if (this._cb) this._cb("SIGNED_IN", sesionDemo);
      return { error: null };
    },
  };

  /* Cliente demo expuesto para script.js */
  window.crearClienteDemo = function () {
    sembrar();
    return {
      esDemo: true,
      auth,
      from: (tabla) => new Consulta(tabla),
    };
  };
})();
