import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

// --- INTERFACES COMPATIBLES Y ACTUALIZADAS ---
interface BultoGeneric {
  idBulto: string;
  numeroPedido: string;
  cip: string;
  propietario: string;
  ucoAsignada: string;
  albaranAsociado: string;
  motivo?: string; // Solo para devoluciones
}

interface MovimientoUnificado {
  idUnico: string; // idRecepcion o idDevolucion
  tipo: "RECEPCION" | "DEVOLUCION";
  fecha: string;
  operario: string;
  bultos: BultoGeneric[];
  timestamp: number; // Ordenación cronológica precisa
}

export default function HistorialGlobalScreen() {
  const router = useRouter();
  const [movimientos, setMovimientos] = useState<MovimientoUnificado[]>([]);
  const [movimientosFiltrados, setMovimientosFiltrados] = useState<
    MovimientoUnificado[]
  >([]);

  // Filtros de interfaz
  const [filtroTipo, setFiltroTipo] = useState<
    "TODOS" | "RECEPCION" | "DEVOLUCION"
  >("TODOS");
  const [busquedaTexto, setBusquedaTexto] = useState("");

  useEffect(() => {
    cargarHistorialUnificado();
  }, []);

  useEffect(() => {
    aplicarFiltrosEstructurales();
  }, [filtroTipo, busquedaTexto, movimientos]);

  const normalizarTexto = (texto: string) => {
    if (!texto) return "";
    return texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  };

  const parsearFechaATimestamp = (fechaStr: string): number => {
    try {
      const partes = fechaStr.split(", ");
      const fechaPartes = partes[0].split("/");
      const horaPartes = partes[1] ? partes[1].split(":") : ["00", "00", "00"];

      const dia = parseInt(fechaPartes[0], 10);
      const mes = parseInt(fechaPartes[1], 10) - 1;
      const anio = parseInt(fechaPartes[2], 10);

      const hora = parseInt(horaPartes[0], 10);
      const minuto = parseInt(horaPartes[1], 10);
      const segundo = parseInt(horaPartes[2], 10);

      return new Date(anio, mes, dia, hora, minuto, segundo).getTime();
    } catch (e) {
      return Date.now();
    }
  };

  const cargarHistorialUnificado = async () => {
    try {
      const bolsaMovimientos: MovimientoUnificado[] = [];

      // 1. CARGAR RECEPCIONES
      const histRecStr = await AsyncStorage.getItem("historico_recepciones");
      if (histRecStr) {
        const recepciones = JSON.parse(histRecStr);
        recepciones.forEach((rec: any) => {
          const bultosParseados: BultoGeneric[] = [];

          if (rec.detalleBultos) {
            rec.detalleBultos.forEach((b: any) => {
              let albEncontrado = "S/A";
              if (rec.ucosAfectadas) {
                if (rec.ucosAfectadas[b.ucoAsignada]?.albaran) {
                  albEncontrado = rec.ucosAfectadas[b.ucoAsignada].albaran;
                } else {
                  const bultoUcoNorm = normalizarTexto(b.ucoAsignada);
                  const fila = Object.values(rec.ucosAfectadas).find(
                    (f: any) =>
                      normalizarTexto(f.nombreUco) === bultoUcoNorm ||
                      normalizarTexto(f.idUco) === bultoUcoNorm,
                  );
                  if (fila && (fila as any).albaran)
                    albEncontrado = (fila as any).albaran;
                }
              }

              bultosParseados.push({
                idBulto: b.idBulto,
                numeroPedido: b.numeroPedido,
                cip: b.cip,
                propietario: b.propietario || "Logística General",
                ucoAsignada: b.ucoAsignada,
                albaranAsociado: albEncontrado,
              });
            });
          }

          // 🛑 FILTRO CRÍTICO: Solo agregar si tiene más de 0 bultos
          if (bultosParseados.length > 0) {
            bolsaMovimientos.push({
              idUnico: rec.idRecepcion,
              tipo: "RECEPCION",
              fecha:
                rec.fechaFinalizacion ||
                new Date(rec.updatedAt || Date.now()).toLocaleString("es-ES"),
              operario: rec.operario
                ? rec.operario.toUpperCase()
                : "DESCONOCIDO",
              bultos: bultosParseados,
              timestamp: rec.updatedAt
                ? new Date(rec.updatedAt).getTime()
                : parsearFechaATimestamp(rec.fechaFinalizacion || ""),
            });
          }
        });
      }

      // 2. CARGAR DEVOLUCIONES
      const histDevStr = await AsyncStorage.getItem("historico_devoluciones");
      if (histDevStr) {
        const devoluciones = JSON.parse(histDevStr);
        devoluciones.forEach((dev: any) => {
          const bultosParseados: BultoGeneric[] = [];

          if (dev.articulos) {
            dev.articulos.forEach((art: any) => {
              bultosParseados.push({
                idBulto: art.idBulto,
                numeroPedido: art.numeroPedido,
                cip: art.cip,
                propietario: art.propietario || "Logística General",
                ucoAsignada: art.ucoAsignada,
                albaranAsociado: art.albaranAsociado || "S/A",
                motivo: art.motivo || "BAJA LOGÍSTICA",
              });
            });
          }

          // 🛑 FILTRO CRÍTICO: Solo agregar si tiene más de 0 bultos
          if (bultosParseados.length > 0) {
            bolsaMovimientos.push({
              idUnico: dev.idDevolucion,
              tipo: "DEVOLUCION",
              fecha: dev.fecha,
              operario: dev.operario
                ? dev.operario.toUpperCase()
                : "DESCONOCIDO",
              bultos: bultosParseados,
              timestamp: dev.updatedAt
                ? new Date(dev.updatedAt).getTime()
                : parsearFechaATimestamp(dev.fecha || ""),
            });
          }
        });
      }

      // Ordenar de más reciente a más antiguo
      bolsaMovimientos.sort((a, b) => b.timestamp - a.timestamp);
      setMovimientos(bolsaMovimientos);
      setMovimientosFiltrados(bolsaMovimientos);
    } catch (error) {
      Alert.alert(
        "Error",
        "No se pudo compilar el historial global de movimientos.",
      );
    }
  };

  const aplicarFiltrosEstructurales = () => {
    let provisional = [...movimientos];

    // Filtro por tipo de movimiento
    if (filtroTipo !== "TODOS") {
      provisional = provisional.filter((m) => m.tipo === filtroTipo);
    }

    // Filtro por barra de búsqueda (ID, Operario, Albarán, Pedido, CIP, UCO)
    if (busquedaTexto.trim() !== "") {
      const query = busquedaTexto.toLowerCase().trim();
      provisional = provisional.filter((m) => {
        const coincideCabecera =
          m.idUnico.toLowerCase().includes(query) ||
          m.operario.toLowerCase().includes(query) ||
          m.fecha.toLowerCase().includes(query);

        const coincideBultos = m.bultos.some(
          (b) =>
            b.idBulto.toLowerCase().includes(query) ||
            b.numeroPedido.toLowerCase().includes(query) ||
            b.cip.toLowerCase().includes(query) ||
            b.ucoAsignada.toLowerCase().includes(query) ||
            b.albaranAsociado.toLowerCase().includes(query) ||
            (b.motivo && b.motivo.toLowerCase().includes(query)),
        );

        return coincideCabecera || coincideBultos;
      });
    }

    setMovimientosFiltrados(provisional);
  };

  return (
    <View style={styles.contenedorBase}>
      {/* CABECERA */}
      <View style={styles.cabecera}>
        <Text style={styles.tituloPantalla}>Historial de Movimientos</Text>
        <Text style={styles.subtituloMeta}>
          Auditoría unificada de Almacén y Distribución
        </Text>
      </View>

      {/* CONTROLES DE FILTRADO */}
      <View style={styles.contenedorFiltros}>
        <View style={styles.filaPildoras}>
          <TouchableOpacity
            style={[
              styles.pildora,
              filtroTipo === "TODOS" && styles.pildoraActiva,
            ]}
            onPress={() => setFiltroTipo("TODOS")}
          >
            <Text
              style={[
                styles.txtPildora,
                filtroTipo === "TODOS" && { color: "#fff" },
              ]}
            >
              🔄 Todos
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.pildora,
              filtroTipo === "RECEPCION" && styles.pildoraRecActiva,
            ]}
            onPress={() => setFiltroTipo("RECEPCION")}
          >
            <Text
              style={[
                styles.txtPildora,
                filtroTipo === "RECEPCION" && { color: "#fff" },
              ]}
            >
              📥 Recepciones
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.pildora,
              filtroTipo === "DEVOLUCION" && styles.pildoraDevActiva,
            ]}
            onPress={() => setFiltroTipo("DEVOLUCION")}
          >
            <Text
              style={[
                styles.txtPildora,
                filtroTipo === "DEVOLUCION" && { color: "#fff" },
              ]}
            >
              ↩️ Devoluciones
            </Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.buscadorText}
          placeholder="🔍 Buscar por ID, Operario, Albarán, Pedido, CIP..."
          placeholderTextColor="#94a3b8"
          value={busquedaTexto}
          onChangeText={setBusquedaTexto}
        />
      </View>

      {/* LISTADO DE MOVIMIENTOS CARD */}
      <ScrollView
        style={styles.scrollListado}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        {movimientosFiltrados.length === 0 ? (
          <Text style={styles.textoListaVacia}>
            No se encontraron registros activos bajo este criterio de búsqueda.
          </Text>
        ) : (
          movimientosFiltrados.map((mov) => {
            const esRecepcion = mov.tipo === "RECEPCION";
            return (
              <View key={mov.idUnico} style={styles.tarjetaMovimiento}>
                {/* CABECERA TARJETA */}
                <View style={styles.cabeceraTarjeta}>
                  <View
                    style={[
                      styles.indicadorTipo,
                      esRecepcion ? styles.bgRecepcion : styles.bgDevolucion,
                    ]}
                  >
                    <Text style={styles.txtIndicador}>{mov.tipo}</Text>
                  </View>
                  <Text style={styles.idMovimiento}>{mov.idUnico}</Text>
                  <Text style={styles.fechaMovimiento}>{mov.fecha}</Text>
                </View>

                <Text style={styles.operarioMovimiento}>
                  👨‍💻 Operario:{" "}
                  <Text style={{ fontWeight: "bold" }}>{mov.operario}</Text>
                </Text>

                {/* DESGLOSE DE BULTOS */}
                <View style={styles.contenedorSubBultos}>
                  <Text style={styles.tituloSubBultos}>
                    Artículos / Bultos vinculados ({mov.bultos.length}):
                  </Text>
                  {mov.bultos.map((b, index) => (
                    <View key={index} style={styles.filaBulto}>
                      <View style={styles.filaBultoPrincipal}>
                        <Text style={styles.txtBultoPrincipal}>
                          📦 ID:{" "}
                          <Text style={styles.txtIdBulto}>{b.idBulto}</Text>
                        </Text>
                        <Text style={styles.badgeAlbaran}>
                          📋 Alb: {b.albaranAsociado}
                        </Text>
                      </View>

                      <Text style={styles.txtBultoMeta}>
                        Pedido: {b.numeroPedido} | CIP: {b.cip}
                      </Text>
                      <Text style={styles.txtBultoMeta}>
                        UCO Destino: {b.ucoAsignada} | Titular: {b.propietario}
                      </Text>

                      {!esRecepcion && b.motivo && (
                        <Text style={styles.txtBultoMotivo}>
                          ⚠️ Motivo Devolución:{" "}
                          <Text style={{ fontWeight: "700" }}>{b.motivo}</Text>
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* BOTÓN VOLVER */}
      <View style={styles.barraAccionesInferior}>
        <TouchableOpacity
          style={styles.btnVolver}
          onPress={() => router.replace("/menu")}
        >
          <Text style={styles.txtVolver}>⬅️ Volver al Menú Principal</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenedorBase: { flex: 1, backgroundColor: "#f5f6fa" },
  cabecera: {
    backgroundColor: "#79715B",
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 15,
  },
  tituloPantalla: { fontSize: 20, fontWeight: "bold", color: "#fff" },
  subtituloMeta: { fontSize: 12, color: "#e0dbcd", marginTop: 2 },

  contenedorFiltros: {
    backgroundColor: "#fff",
    padding: 12,
    borderBottomWidth: 1,
    borderColor: "#cbd5e1",
  },
  filaPildoras: { flexDirection: "row", gap: 6, marginBottom: 10 },
  pildora: {
    flex: 1,
    backgroundColor: "#f1f2f6",
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  pildoraActiva: { backgroundColor: "#2c3e50", borderColor: "#1a252f" },
  pildoraRecActiva: { backgroundColor: "#2ec4b6", borderColor: "#208b81" },
  pildoraDevActiva: { backgroundColor: "#e67e22", borderColor: "#bd661b" },
  txtPildora: { fontSize: 11, fontWeight: "bold", color: "#2c3e50" },
  buscadorText: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 6,
    padding: 10,
    fontSize: 13,
    color: "#2c3e50",
  },

  scrollListado: { flex: 1, paddingHorizontal: 12, paddingTop: 10 },
  textoListaVacia: {
    fontSize: 13,
    color: "#95a5a6",
    textAlign: "center",
    marginTop: 40,
    paddingHorizontal: 20,
  },

  tarjetaMovimiento: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    padding: 12,
    marginBottom: 12,
    elevation: 1,
  },
  cabeceraTarjeta: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderColor: "#f1f2f6",
    paddingBottom: 6,
    marginBottom: 6,
  },
  indicadorTipo: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  bgRecepcion: { backgroundColor: "#2ec4b6" },
  bgDevolucion: { backgroundColor: "#e67e22" },
  txtIndicador: { color: "#fff", fontSize: 10, fontWeight: "bold" },
  idMovimiento: { fontSize: 14, fontWeight: "bold", color: "#2c3e50", flex: 1 },
  fechaMovimiento: { fontSize: 11, color: "#7f8c8d" },
  operarioMovimiento: { fontSize: 12, color: "#34495e", marginBottom: 8 },

  contenedorSubBultos: {
    backgroundColor: "#f8f9fa",
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  tituloSubBultos: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#7f8c8d",
    marginBottom: 4,
  },
  filaBulto: {
    borderBottomWidth: 1,
    borderBottomColor: "#e1e1e1",
    paddingVertical: 6,
  },
  filaBultoPrincipal: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  txtBultoPrincipal: { fontSize: 12, fontWeight: "bold", color: "#2c3e50" },
  txtIdBulto: { fontWeight: "normal", color: "#475569" },
  badgeAlbaran: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#2980b9",
    backgroundColor: "#eaf2f8",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  txtBultoMeta: { fontSize: 11, color: "#57606f", marginTop: 1 },
  txtBultoMotivo: {
    fontSize: 11,
    color: "#c0392b",
    marginTop: 3,
    fontStyle: "italic",
    backgroundColor: "#fdf2f2",
    padding: 4,
    borderRadius: 4,
  },

  barraAccionesInferior: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: "#cbd5e1",
    padding: 12,
  },
  btnVolver: {
    backgroundColor: "#79715B",
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  txtVolver: { color: "#fff", fontWeight: "bold", fontSize: 14 },
});
