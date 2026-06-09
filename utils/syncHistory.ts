import AsyncStorage from "@react-native-async-storage/async-storage";

export interface EventoSincronizacion {
  id: string;
  timestamp: string; // Fecha ISO string para operar con ella
  tipo: "ENVIO" | "RECEPCION";
  terminalRemoto: string; // ID de la PDA o móvil con el que se conectó
  registrosAfectados: number;
  estado: "EXITO" | "FALLO";
  detalles?: string;
}

const STORAGE_KEY = "historico_sincronizacion_bluetooth";

/**
 * Registra un nuevo evento de sincronización Bluetooth y ejecuta
 * una purga automática de los datos que superen los 3 meses de antigüedad.
 */
export const registrarEventoSync = async (
  tipo: "ENVIO" | "RECEPCION",
  terminalRemoto: string,
  registrosAfectados: number,
  estado: "EXITO" | "FALLO",
  detalles?: string,
): Promise<void> => {
  try {
    // 1. Recuperar el histórico actual
    const historicoRaw = await AsyncStorage.getItem(STORAGE_KEY);
    let historico: EventoSincronizacion[] = historicoRaw
      ? JSON.parse(historicoRaw)
      : [];

    // 2. Crear el nuevo evento
    const nuevoEvento: EventoSincronizacion = {
      id: `SYNC-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      tipo,
      terminalRemoto: terminalRemoto || "DESCONOCIDO",
      registrosAfectados,
      estado,
      detalles,
    };

    // 3. Insertar al principio de la lista (para que el más nuevo salga primero)
    historico.unshift(nuevoEvento);

    // 4. --- FILTRO DE CONTROL DE RETENCIÓN: MÁXIMO 3 MESES (90 DÍAS) ---
    const limiteTresMeses = new Date();
    limiteTresMeses.setDate(limiteTresMeses.getDate() - 90);

    // Nos quedamos únicamente con los eventos cuya fecha sea posterior al límite de 3 meses
    const historicoFiltrado = historico.filter((evento) => {
      const fechaEvento = new Date(evento.timestamp);
      return fechaEvento > limiteTresMeses;
    });

    // 5. Guardar la lista limpia de vuelta en el dispositivo
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(historicoFiltrado));

    console.log(
      `[HISTÓRICO] Evento registrado. Registros tras la purga de 3 meses: ${historicoFiltrado.length}`,
    );
  } catch (error) {
    console.error(
      "Error al escribir o purgar el histórico de sincronización:",
      error,
    );
  }
};

/**
 * Recupera el listado completo y filtrado del histórico para pintarlo en pantalla
 */
export const obtenerHistoricoSync = async (): Promise<
  EventoSincronizacion[]
> => {
  try {
    const historicoRaw = await AsyncStorage.getItem(STORAGE_KEY);
    return historicoRaw ? JSON.parse(historicoRaw) : [];
  } catch (error) {
    console.error("Error al recuperar el histórico:", error);
    return [];
  }
};
