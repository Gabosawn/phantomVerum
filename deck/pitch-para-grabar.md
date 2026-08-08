# Pitch para grabar — PhantomTrace (~3:40)

Solo lo que se dice, en orden. Cambiá de slide donde dice ⟶.
Hablá tranquilo. Pausá 2 segundos donde dice (pausa).

---

**⟶ Slide 1**

Lena descubre un fraude de cuarenta millones en la empresa donde trabaja. Para cobrar la recompensa, o para que la ley la proteja, tiene que probar que fue ella la que avisó. Pero el día que da la cara, la echan. Hoy denunciar en serio es elegir: o estás a salvo, o podés reclamar. Somos PhantomTrace, del Midnight Hack Buenos Aires, y borramos esa elección: hacemos el anonimato reversible — probás que fuiste vos cuando quieras, ante quien elijas, y ante nadie más.

**⟶ Slide 2**

Ese dilema es de todos los que saben algo. Para cobrar protección, o reclamar cuando te toman represalias, tenés que probar que fuiste vos — y hoy eso quema tu anonimato desde el día uno. Entonces el que sabe se calla, o denuncia y queda expuesto. Proteger al denunciante no es lo mismo que anonimato eterno.

**⟶ Slide 3**

Lo resolvemos con Midnight, una blockchain donde la lógica corre como prueba de conocimiento cero y el estado sensible nunca se publica. La evidencia, la credencial y la identidad son datos privados: se prueban en zero-knowledge y el proving corre en tu propia máquina, así nunca cruzan a la parte pública. A la cadena solo llega un puñado de hashes. Y las transacciones de Midnight no tienen remitente: no hay dirección de origen. No hay a quién delatar.

**⟶ Slide 4**

Son cuatro tiempos. Uno: la empresa ancla sus credenciales en la cadena. Dos: un empleado denuncia — el circuito prueba en privado que tiene una credencial válida, y sella el hash de la evidencia. Tres: ese sello es inmutable; cambiás un byte y ya no coincide. Cuatro, meses después: revela su autoría ante quien elija.

**⟶ Slide 5**

Todo el sistema es un solo hash, usado tres veces, y la clave está en qué le entra. El sello mezcla la evidencia con tu secreto. El nullifier — el anti-spam — mezcla el secreto de la credencial con la época; y la época no la elige quien denuncia, la fija el reloj de la cadena. Y el recibo de autoría mezcla la denuncia con un número que te manda el fiscal.

**⟶ Slide 6**

Y el modelo de Midnight tiene dos ledgers: uno público y uno privado. Nuestro contrato vive entero en el público — solo escribe hashes, no mueve un solo token. Lo privado aparece en un lugar: el pago de la comisión, que no liga la denuncia a ninguna cuenta. Y la frontera entre lo privado y lo público la hicimos arquitectura: dos aplicaciones separadas. El Cliente corre en tu máquina y guarda los secretos; el Explorer solo lee la cadena. Nada privado tiene dónde filtrarse.

**⟶ Slide 7**

Seamos honestos con lo que ya existe. El buzón anónimo ya existe — incluso Vera Report, de la propia Fundación Midnight, resolvió el reporte anónimo. Pero Vera, y todos, hacen el anonimato permanente. Ninguno deja al autor volver y probar que fue él, ante un destinatario que él elige. Y Midnight pidió exactamente esto en su lista de proyectos buscados. Esa pieza nadie la había llevado a producción. Nosotros sí.

**⟶ Slide 8**

Aterrizado, y es un caso armado a partir de casos reales: Nordwind Logistics, ocho mil empleados. Lena, de contaduría, ve el fraude — pero el canal interno de denuncias lo maneja justo el área que ella tendría que denunciar. Por eso nadie lo usa.

**⟶ Slide 9**

Las credenciales se enchufan al directorio corporativo que la empresa ya tiene, sin cambiar nada. La cadena sella la evidencia, con fecha, sin nombrar a nadie.

**⟶ Slide 10**

Y cuando llega el momento de reclamar, Lena abre la prueba solo ante el fiscal que elige. Nordwind nunca se entera de quién fue, y la ley europea la protege aunque después la identifiquen. Nunca tuvo que elegir entre estar a salvo y poder reclamar.

**⟶ Slide 11**  *(este es el momento fuerte)*

Y esto no es una maqueta: los cuatro tiempos ya corrieron en la red de prueba de Midnight, contra el contrato desplegado — cada bloque se puede verificar desde una terminal. Y acá está el momento: los mismos datos, dos personas. El fiscal que Lena eligió verifica. El empleador, con la misma información pero sin el número que el fiscal le pasó, ni siquiera puede encontrar el registro. Y el nombre del autor en la cadena: no está. Nunca estuvo.

*(pausa — señalá el verde y el rojo)*

**⟶ Slide 12**

Y debajo hay ingeniería de verdad: lo verificamos con dos implementaciones independientes que tienen que coincidir en cada resultado. Cuarenta y ocho casos, trescientos setenta y cinco chequeos, todos en verde. Y trece errores que metimos a propósito para probar los tests — los trece se detectan. Compila limpio desde cero.

**⟶ Slide 13**  *(si vas corto de tiempo, saltá esta)*

Quién compra esto: la empresa de más de cincuenta empleados que la ley europea obliga a tener un canal de denuncias — pero que no quiere guardar una base de datos de denunciantes que le pueden filtrar. Somos ese canal: cumple la ley sin crear el riesgo.

**⟶ Slide 14**

Lena denunció esa misma noche, anónima. Y el día que quiso, probó que fue ella — solo ante el fiscal, nunca ante la empresa. Nunca tuvo que elegir entre estar a salvo y reclamar. El buzón anónimo es plomería; la autoría diferida es el producto. Nadie la había shippeado. Nosotros sí. PhantomTrace.

*(pausa. Sonreí.)*
