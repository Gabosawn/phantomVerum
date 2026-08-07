/**
 * Genera los dos PDFs de muestra de la demo.
 *
 * El objetivo es que "un byte distinto" sea literalmente cierto y verificable:
 * los dos archivos son idénticos salvo por UN carácter del monto adjudicado
 * (1 → 2). Como las dos cadenas miden lo mismo, ni /Length ni ningún offset
 * del xref cambian: `cmp -l` reporta exactamente una diferencia.
 *
 *   node ui/shared/generar-muestras.mjs
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DESTINO = fileURLToPath(new URL("./publico/muestras/", import.meta.url));

/** El monto es lo único que cambia entre las dos versiones. Misma longitud. */
function cuerpo(monto) {
  return [
    "EXPEDIENTE 4471/2026 - ADJUDICACION DIRECTA",
    "",
    "Municipalidad de San Vicente / ACME S.A.",
    "Obra: repavimentacion Av. Costanera, tramo 3.",
    "",
    `Monto adjudicado: USD ${monto}`,
    "Oferentes presentados: 1 (uno).",
    "Llamado a licitacion: no consta en el expediente.",
    "",
    "Firma: Direccion de Compras y Contrataciones.",
    "",
    "-- documento de muestra, Phantom Trace / Midnight Hack BA 2026 --",
  ];
}

function armarPdf(lineas) {
  const texto = lineas
    .map((l, i) => {
      const escapado = l.replace(/([()\\])/g, "\\$1");
      return i === 0
        ? `BT /F1 11 Tf 56 780 Td 16 TL (${escapado}) Tj`
        : `T* (${escapado}) Tj`;
    })
    .join("\n");
  const stream = `${texto}\nET\n`;

  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objetos.forEach((cuerpoObj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${cuerpoObj}\nendobj\n`;
  });

  const inicioXref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

const original = armarPdf(cuerpo("4.471.000"));
const alterado = armarPdf(cuerpo("4.472.000"));

writeFileSync(`${DESTINO}contrato-obra-4471.pdf`, original);
writeFileSync(`${DESTINO}contrato-obra-4471-rev-legal.pdf`, alterado);

// Chequeo duro: si esto no da 1, el discurso de la demo deja de ser cierto.
let distintos = 0;
for (let i = 0; i < original.length; i++) {
  if (original[i] !== alterado[i]) distintos++;
}
if (original.length !== alterado.length || distintos !== 1) {
  console.error(
    `ERROR: los archivos difieren en ${distintos} bytes (largos ${original.length}/${alterado.length}), se esperaba exactamente 1`,
  );
  process.exit(1);
}

console.log(`contrato-obra-4471.pdf           ${original.length} bytes`);
console.log(`contrato-obra-4471-rev-legal.pdf ${alterado.length} bytes`);
console.log(`difieren en ${distintos} byte`);
