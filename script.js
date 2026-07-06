/* ============================================================
   CONFIGURACIÓN DE SUPABASE
   Rellena estas dos variables con las credenciales de tu proyecto.
   Las encuentras en Supabase → Project Settings → API
   ============================================================ */
const SUPABASE_URL = "https://mrtjbpsqfrapciutcpki.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_EZQnMBx2fi7615U2ah2fDw_RAbot47v";

/* ------------------------------------------------------------
   Inicialización del cliente de Supabase (cargado por CDN)
   Si faltan las credenciales, NO reventamos el script: mostramos
   un aviso y dejamos db = null para que la app no se cuelgue.
   ------------------------------------------------------------ */
let db = null;
let modoDemo = false;
if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
  // Credenciales reales → Supabase
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else if (window.crearClienteDemo) {
  // Sin credenciales → backend de demostración (localStorage)
  db = window.crearClienteDemo();
  modoDemo = true;
  console.info("MODO DEMO activo: los datos se guardan en tu navegador (localStorage).");
} else if (!window.supabase) {
  console.error("No se cargó la librería de Supabase (¿sin conexión a internet?).");
}

const TABLA = "inquilinos";

/* ------------------------------------------------------------
   Referencias al DOM
   ------------------------------------------------------------ */
const cargando       = document.getElementById("cargando");
const pantallaAuth   = document.getElementById("pantalla-auth");
const pantallaApp    = document.getElementById("pantalla-app");

const formAuth       = document.getElementById("form-auth");
const authEmail      = document.getElementById("auth-email");
const authPass       = document.getElementById("auth-pass");
const btnAuth        = document.getElementById("btn-auth");
const authToggleLink = document.getElementById("auth-toggle-link");
const authToggleTexto= document.getElementById("auth-toggle-texto");

const usuarioEmail   = document.getElementById("usuario-email");
const btnLogout      = document.getElementById("btn-logout");

const form           = document.getElementById("form-inquilino");
const formTitulo     = document.getElementById("form-titulo");
const editId         = document.getElementById("edit-id");
const btnAnadir      = document.getElementById("btn-anadir");
const btnCancelar    = document.getElementById("btn-cancelar");
const tablaBody      = document.getElementById("tabla-body");
const listaCards     = document.getElementById("lista-cards");
const sinDatos       = document.getElementById("sin-datos");
const buscador       = document.getElementById("buscador");
const btnExportar    = document.getElementById("btn-exportar");
const btnNuevoMes    = document.getElementById("btn-nuevo-mes");
const mensaje        = document.getElementById("mensaje");

const modalHistorial = document.getElementById("modal-historial");
const modalTitulo    = document.getElementById("modal-titulo");
const modalBody      = document.getElementById("modal-body");

const calPrev        = document.getElementById("cal-prev");
const calNext        = document.getElementById("cal-next");
const calMesLabel    = document.getElementById("calendario-mes-label");
const calLista       = document.getElementById("calendario-lista");

const statTotal      = document.getElementById("stat-total");
const statCobrado    = document.getElementById("stat-cobrado");
const statPendiente  = document.getElementById("stat-pendiente");
const statMensual    = document.getElementById("stat-mensual");

/* Estado en memoria */
let inquilinosCache = [];
let modoRegistro = false;   // false = login, true = registro
let filtroActivo = "todos"; // todos | pagado | pendiente
let usuarioActual = null;   // email del usuario autenticado (para los recibos)

const TABLA_PAGOS = "pagos";
const MESES = ["enero","febrero","marzo","abril","mayo","junio",
               "julio","agosto","septiembre","octubre","noviembre","diciembre"];

/* Mes que se está viendo actualmente en el calendario ('YYYY-MM') */
let mesCalendario = null;

/* Periodo actual en formato 'YYYY-MM' (ej. "2026-07") */
function periodoActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* 'YYYY-MM' → "julio 2026" */
function periodoLabel(p) {
  const [y, m] = (p || "").split("-");
  return `${MESES[Number(m) - 1] || "?"} ${y || ""}`.trim();
}

/* Suma (o resta) meses a un periodo 'YYYY-MM' */
function sumarMeses(periodo, delta) {
  const [y, m] = periodo.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------
   Utilidades
   ------------------------------------------------------------ */
let mensajeTimeout;
function mostrarMensaje(texto, tipo = "error") {
  mensaje.textContent = texto;
  mensaje.className = "mensaje " + (tipo === "ok" ? "mensaje-ok" : "mensaje-error");
  mensaje.hidden = false;
  clearTimeout(mensajeTimeout);
  mensajeTimeout = setTimeout(() => (mensaje.hidden = true), 4500);
}

function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML;
}

/* Formatea un número como euros: 750 → "750,00 €" */
const eurFmt = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
});
function eur(n) {
  return eurFmt.format(Number(n) || 0);
}

/* Formatea una fecha ISO a "dd/mm/aaaa" */
function fecha(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-ES");
}

function credencialesConfiguradas() {
  if (!db) {
    cargando.hidden = true;
    pantallaAuth.hidden = false;
    mostrarMensaje(
      !window.supabase
        ? "No se pudo cargar Supabase. Revisa tu conexión a internet."
        : "Configura SUPABASE_URL y SUPABASE_ANON_KEY en script.js.",
      "error"
    );
    return false;
  }
  return true;
}

/* ============================================================
   AUTENTICACIÓN
   ============================================================ */
authToggleLink.addEventListener("click", (e) => {
  e.preventDefault();
  modoRegistro = !modoRegistro;
  if (modoRegistro) {
    btnAuth.textContent = "Crear cuenta";
    authToggleTexto.textContent = "¿Ya tienes cuenta?";
    authToggleLink.textContent = "Inicia sesión";
  } else {
    btnAuth.textContent = "Iniciar sesión";
    authToggleTexto.textContent = "¿No tienes cuenta?";
    authToggleLink.textContent = "Regístrate";
  }
});

formAuth.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!credencialesConfiguradas()) return;

  const email = authEmail.value.trim();
  const password = authPass.value;

  btnAuth.disabled = true;
  const textoOriginal = btnAuth.textContent;
  btnAuth.textContent = "Procesando…";

  let error;
  if (modoRegistro) {
    ({ error } = await db.auth.signUp({ email, password }));
  } else {
    ({ error } = await db.auth.signInWithPassword({ email, password }));
  }

  btnAuth.disabled = false;
  btnAuth.textContent = textoOriginal;

  if (error) {
    console.error("Error de autenticación:", error);
    mostrarMensaje(error.message);
    return;
  }

  if (modoRegistro) {
    mostrarMensaje("Cuenta creada. Si tu proyecto exige confirmación por email, revisa tu bandeja.", "ok");
  }
});

btnLogout.addEventListener("click", async () => {
  await db.auth.signOut();
});

if (db) db.auth.onAuthStateChange((_evento, session) => {
  cargando.hidden = true;
  if (session && session.user) {
    usuarioActual = session.user.email;
    pantallaAuth.hidden = true;
    pantallaApp.hidden = false;
    usuarioEmail.textContent = session.user.email;
    if (modoDemo) {
      mostrarMensaje("Modo DEMO: los datos se guardan solo en este navegador.", "ok");
    }
    cargarInquilinos();
  } else {
    usuarioActual = null;
    pantallaApp.hidden = true;
    pantallaAuth.hidden = false;
  }
});

/* ============================================================
   READ — Leer y mostrar los inquilinos del usuario
   ============================================================ */
async function cargarInquilinos() {
  if (!credencialesConfiguradas()) return;

  const { data, error } = await db
    .from(TABLA)
    .select("*")
    .order("dia_cobro", { ascending: true })
    .order("nombre", { ascending: true });

  if (error) {
    console.error("Error al cargar inquilinos:", error);
    mostrarMensaje("No se pudieron cargar los inquilinos: " + error.message);
    return;
  }

  inquilinosCache = data || [];
  renderizar();
  cargarCalendario(mesCalendario || periodoActual());
}

/* ============================================================
   CALENDARIO MENSUAL DE PAGOS
   ============================================================ */
async function cargarCalendario(periodo) {
  if (!db) return;
  mesCalendario = periodo;
  calMesLabel.textContent = periodoLabel(periodo).toUpperCase();

  if (inquilinosCache.length === 0) {
    calLista.innerHTML = "<p class='sin-datos'>Añade inquilinos para verlos aquí.</p>";
    return;
  }

  const { data, error } = await db
    .from(TABLA_PAGOS)
    .select("inquilino_id")
    .eq("periodo", periodo);

  if (error) {
    console.error("Error al cargar el calendario:", error);
    calLista.innerHTML = "<p class='sin-datos'>No se pudo cargar el calendario.</p>";
    return;
  }

  const pagadosSet = new Set((data || []).map((p) => String(p.inquilino_id)));

  calLista.innerHTML = inquilinosCache.map((inq) => {
    const pagado = pagadosSet.has(String(inq.id));
    return `
      <button class="cal-item ${pagado ? "cal-pagado" : "cal-pendiente"}" data-id="${inq.id}" data-pagado="${pagado}">
        <span class="cal-emoji">${pagado ? "✅" : "❌"}</span>
        <span class="cal-nombre">${escapar(inq.nombre)}</span>
        <span class="cal-importe">${eur(inq.importe)}</span>
      </button>
    `;
  }).join("");
}

/* Marca/desmarca el pago de un inquilino para un mes concreto del calendario */
async function toggleCalendario(inquilinoId, periodo, marcarPagado) {
  if (!credencialesConfiguradas()) return;

  // Si es el mes en curso, reutilizamos actualizarPago() para mantener
  // sincronizado el estado "en vivo" del inquilino con el historial.
  if (periodo === periodoActual()) {
    await actualizarPago(inquilinoId, marcarPagado);
    return;
  }

  const inq = inquilinosCache.find((i) => String(i.id) === String(inquilinoId));

  if (marcarPagado) {
    const { error } = await db.from(TABLA_PAGOS).upsert(
      {
        inquilino_id: inquilinoId,
        periodo,
        importe: inq ? inq.importe : 0,
        fecha_pago: new Date().toISOString(),
      },
      { onConflict: "inquilino_id,periodo" }
    );
    if (error) {
      console.error("Error al registrar el pago:", error);
      mostrarMensaje("No se pudo registrar el pago: " + error.message);
      return;
    }
  } else {
    const { error } = await db
      .from(TABLA_PAGOS)
      .delete()
      .eq("inquilino_id", inquilinoId)
      .eq("periodo", periodo);
    if (error) {
      console.error("Error al desmarcar el pago:", error);
      mostrarMensaje("No se pudo actualizar: " + error.message);
      return;
    }
  }

  cargarCalendario(periodo);
}

calLista.addEventListener("click", (e) => {
  const boton = e.target.closest(".cal-item");
  if (!boton) return;
  toggleCalendario(boton.dataset.id, mesCalendario, boton.dataset.pagado !== "true");
});

calPrev.addEventListener("click", () => cargarCalendario(sumarMeses(mesCalendario || periodoActual(), -1)));
calNext.addEventListener("click", () => cargarCalendario(sumarMeses(mesCalendario || periodoActual(), 1)));

/* Aplica buscador + filtro y devuelve la lista visible */
function listaVisible() {
  const texto = buscador.value.trim().toLowerCase();
  return inquilinosCache.filter((i) => {
    const coincideTexto = !texto ||
      [i.nombre, i.correo, i.telefono].some((c) => (c || "").toLowerCase().includes(texto));
    const coincideFiltro =
      filtroActivo === "todos" ||
      (filtroActivo === "pagado" && i.pagado) ||
      (filtroActivo === "pendiente" && !i.pagado);
    return coincideTexto && coincideFiltro;
  });
}

function renderizar() {
  const lista = listaVisible();
  actualizarStats();

  tablaBody.innerHTML = "";
  listaCards.innerHTML = "";

  if (lista.length === 0) {
    sinDatos.hidden = false;
    sinDatos.textContent = inquilinosCache.length === 0
      ? "No hay inquilinos registrados todavía."
      : "Ningún inquilino coincide con la búsqueda o el filtro.";
    return;
  }
  sinDatos.hidden = true;

  lista.forEach((inq) => {
    tablaBody.appendChild(crearFila(inq));
    listaCards.appendChild(crearCard(inq));
  });
}

/* Estadísticas en euros (sobre TODA la cartera, no solo lo filtrado) */
function actualizarStats() {
  const total = inquilinosCache.length;
  let cobrado = 0, pendiente = 0, mensual = 0;

  inquilinosCache.forEach((i) => {
    const importe = Number(i.importe) || 0;
    mensual += importe;
    if (i.pagado) cobrado += importe;
    else pendiente += importe;
  });

  statTotal.textContent = total;
  statCobrado.textContent = eur(cobrado);
  statPendiente.textContent = eur(pendiente);
  statMensual.textContent = eur(mensual);
}

function botonEstado(inq) {
  const clase = inq.pagado ? "estado-pagado" : "estado-pendiente";
  const texto = inq.pagado ? "✅ Pagado" : "❌ Pendiente";
  return `<button class="estado-btn ${clase}" data-accion="toggle" data-id="${inq.id}" data-pagado="${inq.pagado}">${texto}</button>`;
}

/* Fila de tabla (escritorio) */
function crearFila(inq) {
  const tr = document.createElement("tr");
  const infoPago = inq.pagado && inq.fecha_pago
    ? `<span class="fecha-pago">Pagó el ${fecha(inq.fecha_pago)}</span>` : "";

  tr.innerHTML = `
    <td>${escapar(inq.nombre)}</td>
    <td>
      ${escapar(inq.correo)}
      <span class="contacto-sec">· ${escapar(inq.telefono)}</span>
    </td>
    <td class="col-right"><span class="importe-val">${eur(inq.importe)}</span></td>
    <td class="col-center">Día ${escapar(inq.dia_cobro)}</td>
    <td class="col-center">${botonEstado(inq)}${infoPago}</td>
    <td class="col-center">
      <div class="acciones-cell">
        <button class="btn btn-editar" data-accion="editar" data-id="${inq.id}" title="Editar">✎</button>
        <button class="btn btn-recibo" data-accion="recibo" data-id="${inq.id}" title="Recibo PDF">🧾</button>
        <button class="btn btn-historial" data-accion="historial" data-id="${inq.id}" title="Historial">📜</button>
        <button class="btn btn-eliminar" data-accion="eliminar" data-id="${inq.id}" title="Eliminar">🗑</button>
      </div>
    </td>
  `;
  return tr;
}

/* Tarjeta (móvil / iPhone) */
function crearCard(inq) {
  const div = document.createElement("div");
  div.className = "inq-card";
  const infoPago = inq.pagado && inq.fecha_pago
    ? `<span class="inq-card-dato">✅ Pagado el ${fecha(inq.fecha_pago)}</span>` : "";

  div.innerHTML = `
    <div class="inq-card-top">
      <div>
        <div class="inq-card-nombre">${escapar(inq.nombre)}</div>
        <div class="inq-card-importe">${eur(inq.importe)} <small>/mes · cobro día ${escapar(inq.dia_cobro)}</small></div>
      </div>
      ${botonEstado(inq)}
    </div>
    <span class="inq-card-dato">✉️ ${escapar(inq.correo)}</span>
    <span class="inq-card-dato">📞 ${escapar(inq.telefono)}</span>
    ${infoPago}
    <div class="inq-card-acciones">
      <button class="btn btn-editar" data-accion="editar" data-id="${inq.id}">✎ Editar</button>
      <button class="btn btn-recibo" data-accion="recibo" data-id="${inq.id}">🧾 Recibo</button>
    </div>
    <div class="inq-card-acciones">
      <button class="btn btn-historial" data-accion="historial" data-id="${inq.id}">📜 Historial</button>
      <button class="btn btn-eliminar" data-accion="eliminar" data-id="${inq.id}">🗑 Eliminar</button>
    </div>
  `;
  return div;
}

/* Buscador en vivo */
buscador.addEventListener("input", renderizar);

/* Filtros (chips) */
document.querySelector(".filtros").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  filtroActivo = chip.dataset.filtro;
  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("chip-activo"));
  chip.classList.add("chip-activo");
  renderizar();
});

/* ============================================================
   CREATE / UPDATE — Guardar (alta o edición) desde el formulario
   ============================================================ */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!credencialesConfiguradas()) return;

  const datos = {
    nombre: document.getElementById("nombre").value.trim(),
    correo: document.getElementById("correo").value.trim(),
    telefono: document.getElementById("telefono").value.trim(),
    importe: parseFloat(document.getElementById("importe").value) || 0,
    dia_cobro: parseInt(document.getElementById("dia-cobro").value, 10) || 1,
  };

  if (!datos.nombre || !datos.correo || !datos.telefono) {
    mostrarMensaje("Nombre, correo y teléfono son obligatorios.");
    return;
  }

  btnAnadir.disabled = true;
  const textoOriginal = btnAnadir.textContent;
  btnAnadir.textContent = "Guardando…";

  let error;
  if (editId.value) {
    // Edición
    ({ error } = await db.from(TABLA).update(datos).eq("id", editId.value));
  } else {
    // Alta (pagado arranca en false; user_id lo pone la BD)
    datos.pagado = false;
    ({ error } = await db.from(TABLA).insert([datos]));
  }

  btnAnadir.disabled = false;
  btnAnadir.textContent = textoOriginal;

  if (error) {
    console.error("Error al guardar:", error);
    mostrarMensaje("No se pudo guardar: " + error.message);
    return;
  }

  mostrarMensaje(editId.value ? "Inquilino actualizado." : "Inquilino añadido.", "ok");
  salirModoEdicion();
  cargarInquilinos();
});

/* Preparar el formulario para editar */
function entrarModoEdicion(inq) {
  editId.value = inq.id;
  document.getElementById("nombre").value = inq.nombre;
  document.getElementById("correo").value = inq.correo;
  document.getElementById("telefono").value = inq.telefono;
  document.getElementById("importe").value = inq.importe;
  document.getElementById("dia-cobro").value = inq.dia_cobro;

  formTitulo.textContent = "Editar inquilino";
  btnAnadir.textContent = "Guardar cambios";
  btnCancelar.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function salirModoEdicion() {
  editId.value = "";
  form.reset();
  formTitulo.textContent = "Añadir inquilino";
  btnAnadir.textContent = "＋ Añadir";
  btnCancelar.hidden = true;
}

btnCancelar.addEventListener("click", salirModoEdicion);

/* ============================================================
   Delegación de eventos (tabla y tarjetas)
   ============================================================ */
function manejarClick(e) {
  const boton = e.target.closest("button[data-accion]");
  if (!boton) return;

  const id = boton.dataset.id;
  const accion = boton.dataset.accion;

  if (accion === "toggle") {
    actualizarPago(id, boton.dataset.pagado !== "true");
  } else if (accion === "eliminar") {
    eliminarInquilino(id);
  } else if (accion === "editar") {
    const inq = inquilinosCache.find((i) => String(i.id) === String(id));
    if (inq) entrarModoEdicion(inq);
  } else if (accion === "recibo") {
    reciboMesActual(id);
  } else if (accion === "historial") {
    verHistorial(id);
  }
}
tablaBody.addEventListener("click", manejarClick);
listaCards.addEventListener("click", manejarClick);

/* UPDATE — Cambiar estado de pago, registrar la fecha y sincronizar el historial */
async function actualizarPago(id, pagado) {
  if (!credencialesConfiguradas()) return;

  const inq = inquilinosCache.find((i) => String(i.id) === String(id));
  const periodo = periodoActual();
  const ahora = new Date().toISOString();

  const cambios = { pagado, fecha_pago: pagado ? ahora : null };
  const { error } = await db.from(TABLA).update(cambios).eq("id", id);

  if (error) {
    console.error("Error al actualizar:", error);
    mostrarMensaje("No se pudo actualizar el estado: " + error.message);
    return;
  }

  // Sincronizar el historial de pagos del mes en curso
  if (pagado) {
    const { error: e2 } = await db.from(TABLA_PAGOS).upsert(
      {
        inquilino_id: id,
        periodo,
        importe: inq ? inq.importe : 0,
        fecha_pago: ahora,
      },
      { onConflict: "inquilino_id,periodo" }
    );
    if (e2) console.error("Error al registrar el pago en el historial:", e2);
  } else {
    const { error: e2 } = await db
      .from(TABLA_PAGOS)
      .delete()
      .eq("inquilino_id", id)
      .eq("periodo", periodo);
    if (e2) console.error("Error al borrar el pago del historial:", e2);
  }

  cargarInquilinos();
}

/* ============================================================
   REINICIO MENSUAL — Marcar todos como "Pendiente" para el nuevo mes
   (el historial de pagos se conserva en la tabla 'pagos')
   ============================================================ */
btnNuevoMes.addEventListener("click", async () => {
  if (!credencialesConfiguradas()) return;
  if (inquilinosCache.length === 0) {
    mostrarMensaje("No hay inquilinos.");
    return;
  }
  if (!confirm(
    "Se marcarán TODOS los inquilinos como 'Pendiente' para empezar un nuevo mes.\n" +
    "El historial de pagos anteriores se conserva. ¿Continuar?"
  )) return;

  const { error } = await db
    .from(TABLA)
    .update({ pagado: false, fecha_pago: null })
    .eq("pagado", true);

  if (error) {
    console.error("Error en el reinicio mensual:", error);
    mostrarMensaje("No se pudo reiniciar el mes: " + error.message);
    return;
  }
  mostrarMensaje("Nuevo mes iniciado. Todos marcados como pendientes.", "ok");
  cargarInquilinos();
});

/* ============================================================
   HISTORIAL DE PAGOS (modal)
   ============================================================ */
async function verHistorial(id) {
  if (!credencialesConfiguradas()) return;
  const inq = inquilinosCache.find((i) => String(i.id) === String(id));
  if (!inq) return;

  modalTitulo.textContent = "Historial · " + inq.nombre;
  modalBody.innerHTML = "<p class='sin-datos'>Cargando…</p>";
  abrirModal();

  const { data, error } = await db
    .from(TABLA_PAGOS)
    .select("*")
    .eq("inquilino_id", id)
    .order("periodo", { ascending: false });

  if (error) {
    console.error("Error al cargar el historial:", error);
    modalBody.innerHTML = "<p class='sin-datos'>No se pudo cargar el historial.</p>";
    return;
  }

  if (!data || data.length === 0) {
    modalBody.innerHTML = "<p class='sin-datos'>Todavía no hay pagos registrados.</p>";
    return;
  }

  // Guardamos los pagos para poder generar el recibo desde el modal
  modalBody.innerHTML = data.map((p) => `
    <div class="pago-item">
      <div>
        <div class="pago-periodo">${periodoLabel(p.periodo)}</div>
        <div class="pago-detalle">Pagado el ${fecha(p.fecha_pago)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <span class="pago-importe">${eur(p.importe)}</span>
        <button class="btn btn-recibo" data-recibo-periodo="${p.periodo}"
          data-recibo-importe="${p.importe}" data-recibo-fecha="${p.fecha_pago}"
          data-recibo-nombre="${escapar(inq.nombre)}">🧾 PDF</button>
      </div>
    </div>
  `).join("");
}

modalBody.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-recibo-periodo]");
  if (!btn) return;
  generarRecibo({
    nombre: btn.dataset.reciboNombre,
    importe: btn.dataset.reciboImporte,
    periodo: btn.dataset.reciboPeriodo,
    fecha_pago: btn.dataset.reciboFecha,
  });
});

function abrirModal() { modalHistorial.hidden = false; }
function cerrarModal() { modalHistorial.hidden = true; }

modalHistorial.addEventListener("click", (e) => {
  if (e.target.hasAttribute("data-cerrar-modal")) cerrarModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") cerrarModal();
});

/* ============================================================
   RECIBOS EN PDF (jsPDF)
   ============================================================ */
/* Genera el recibo del mes en curso para un inquilino */
function reciboMesActual(id) {
  const inq = inquilinosCache.find((i) => String(i.id) === String(id));
  if (!inq) return;
  if (!inq.pagado) {
    mostrarMensaje("Marca al inquilino como 'Pagado' antes de emitir el recibo del mes.");
    return;
  }
  generarRecibo({
    nombre: inq.nombre,
    importe: inq.importe,
    periodo: periodoActual(),
    fecha_pago: inq.fecha_pago,
  });
}

/* Dibuja y descarga el PDF del recibo */
function generarRecibo({ nombre, importe, periodo, fecha_pago }) {
  if (!window.jspdf) {
    mostrarMensaje("No se pudo cargar el generador de PDF. Revisa tu conexión.");
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const numero = `${periodo}-${String(nombre).slice(0, 3).toUpperCase()}`;
  const importeTxt = eur(importe);
  const fechaTxt = fecha(fecha_pago) || fecha(new Date().toISOString());

  // Cabecera
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("RECIBO DE ALQUILER", 105, 25, { align: "center" });

  doc.setDrawColor(37, 99, 235);
  doc.setLineWidth(0.8);
  doc.line(20, 32, 190, 32);

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Nº de recibo: ${numero}`, 20, 42);
  doc.text(`Fecha de emisión: ${fecha(new Date().toISOString())}`, 20, 48);
  if (usuarioActual) doc.text(`Emitido por: ${usuarioActual}`, 20, 54);

  // Cuerpo
  doc.setFontSize(12);
  let y = 72;
  const linea = (etiqueta, valor) => {
    doc.setFont("helvetica", "bold");
    doc.text(etiqueta, 20, y);
    doc.setFont("helvetica", "normal");
    doc.text(String(valor), 80, y);
    y += 10;
  };

  linea("Recibí de:", nombre);
  linea("Concepto:", "Alquiler mensual");
  linea("Periodo:", periodoLabel(periodo));
  linea("Fecha de pago:", fechaTxt);

  // Importe destacado
  doc.setFillColor(240, 253, 244);
  doc.rect(20, y, 170, 16, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("IMPORTE PAGADO:", 25, y + 10);
  doc.text(importeTxt, 185, y + 10, { align: "right" });

  // Pie
  y += 40;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Firma del arrendador:", 20, y);
  doc.line(20, y + 18, 90, y + 18);

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    "Este recibo acredita el pago del alquiler correspondiente al periodo indicado.",
    105, 285, { align: "center" }
  );

  doc.save(`recibo_${String(nombre).replace(/\s+/g, "_")}_${periodo}.pdf`);
}

/* DELETE — Eliminar un inquilino */
async function eliminarInquilino(id) {
  if (!credencialesConfiguradas()) return;
  if (!confirm("¿Seguro que quieres eliminar este inquilino?")) return;

  const { error } = await db.from(TABLA).delete().eq("id", id);

  if (error) {
    console.error("Error al eliminar:", error);
    mostrarMensaje("No se pudo eliminar el inquilino: " + error.message);
    return;
  }
  mostrarMensaje("Inquilino eliminado.", "ok");
  cargarInquilinos();
}

/* ============================================================
   EXPORTAR A CSV
   ============================================================ */
btnExportar.addEventListener("click", () => {
  if (inquilinosCache.length === 0) {
    mostrarMensaje("No hay datos para exportar.");
    return;
  }

  const cabeceras = ["Nombre", "Correo", "Telefono", "Importe", "Dia de cobro", "Estado", "Fecha de pago"];
  const filas = inquilinosCache.map((i) => [
    i.nombre,
    i.correo,
    i.telefono,
    i.importe,
    i.dia_cobro,
    i.pagado ? "Pagado" : "Pendiente",
    i.fecha_pago ? fecha(i.fecha_pago) : "",
  ]);

  // Escapa comillas y envuelve cada celda
  const csv = [cabeceras, ...filas]
    .map((fila) => fila.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))
    .join("\n");

  // BOM para que Excel reconozca los acentos
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `inquilinos_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

/* ============================================================
   Inicio: comprobar sesión existente al cargar la página
   ============================================================ */
(async function init() {
  if (!credencialesConfiguradas()) return;

  // En modo demo, mostramos la pista de credenciales y ocultamos el registro
  if (modoDemo) {
    const hint = document.getElementById("auth-demo-hint");
    if (hint) hint.hidden = false;
    const toggle = document.querySelector(".auth-toggle");
    if (toggle) toggle.hidden = true;
  }

  const { data } = await db.auth.getSession();
  cargando.hidden = true;
  if (!data.session) {
    pantallaAuth.hidden = false;
  }
})();