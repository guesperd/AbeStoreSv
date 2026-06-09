import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

interface Usuario {
  nombre: string;
  contrasena: string;
  rol: string;
}

export default function LoginScreen() {
  const router = useRouter();

  // Estados de los campos
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");

  // Estado para la cabecera dinámica de la UCO
  const [sedeUco, setSedeUco] = useState("Ejército de Tierra");

  // useFocusEffect se encarga de refrescar todo cada vez que la pantalla vuelve a primer plano
  useFocusEffect(
    useCallback(() => {
      const cargarDatosIniciales = async () => {
        try {
          // 1. Cargar la UCO Receptora Principal de forma segura parseando el objeto con timestamp
          const ucoGuardadaRaw = await AsyncStorage.getItem("uco_receptora");

          if (ucoGuardadaRaw !== null && ucoGuardadaRaw.trim() !== "") {
            try {
              const objetoUco = JSON.parse(ucoGuardadaRaw);
              // Si es un objeto válido y tiene la propiedad nombre, la extraemos
              if (objetoUco && objetoUco.nombre) {
                setSedeUco(objetoUco.nombre.trim());
              } else {
                setSedeUco(ucoGuardadaRaw.trim());
              }
            } catch (e) {
              // Retrocompatibilidad: Si falla el JSON.parse, significa que era texto plano antiguo
              setSedeUco(ucoGuardadaRaw.trim());
            }
          } else {
            setSedeUco("Ejército de Tierra");
          }

          // 2. RECUPERAR EL ÚLTIMO OPERARIO LOGUEADO
          const ultimoUsuario = await AsyncStorage.getItem("usuario_activo");
          if (ultimoUsuario !== null) {
            setUser(ultimoUsuario); // Dejamos el cuadro de usuario ya escrito
          }
        } catch (error) {
          setSedeUco("Ejército de Tierra");
        }
      };

      cargarDatosIniciales();
    }, []),
  );

  const manejarLogin = async () => {
    if (user.trim() === "" || pass.trim() === "") {
      Alert.alert(
        "Campos vacíos",
        "Por favor, introduce tu usuario y contraseña.",
      );
      return;
    }

    try {
      const datosLocales = await AsyncStorage.getItem("lista_usuarios");
      let listaUsuarios: Usuario[] = [];

      if (datosLocales !== null) {
        listaUsuarios = JSON.parse(datosLocales);
      } else {
        // Usuario administrador maestro por defecto si la lista está vacía
        listaUsuarios = [
          { nombre: "admin", contrasena: "1234", rol: "Administrador" },
        ];
        await AsyncStorage.setItem(
          "lista_usuarios",
          JSON.stringify(listaUsuarios),
        );
      }

      const cuentaEncontrada = listaUsuarios.find(
        (u) =>
          u.nombre.toLowerCase() === user.trim().toLowerCase() &&
          u.contrasena === pass,
      );

      if (cuentaEncontrada) {
        // Guardamos el usuario activo que acabas de loguear (servirá para la próxima vez)
        await AsyncStorage.setItem("usuario_activo", cuentaEncontrada.nombre);

        // Limpiamos solo la contraseña por seguridad al avanzar
        setPass("");

        router.replace("/menu");
      } else {
        Alert.alert(
          "Acción Denegada",
          "El usuario o la contraseña introducidos no son correctos.",
        );
      }
    } catch (error) {
      Alert.alert(
        "Error",
        "Hubo un fallo al conectar con la base de datos local.",
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.pantallaCompleta}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContenedor}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.tarjetaLogin}>
          {/* ICONO ESTILO ALMACÉN LOGÍSTICO */}
          <View style={styles.contenedorIcono}>
            <Text style={styles.iconoAlmacen}>🏭</Text>
          </View>

          {/* CABECERA OFICIAL */}
          <Text style={styles.tituloApp}>SERVICIO DE ALMACÉN</Text>
          <Text style={styles.subtituloUco}>{sedeUco.toUpperCase()}</Text>

          {/* FORMULARIO DE ACCESO */}
          <View style={styles.contenedorFormulario}>
            <TextInput
              style={styles.input}
              placeholder="Código de Operario / Usuario"
              value={user}
              onChangeText={setUser}
              autoCapitalize="none"
              placeholderTextColor="#95a5a6"
            />

            <TextInput
              style={styles.input}
              placeholder="Contraseña de Acceso"
              value={pass}
              onChangeText={setPass}
              secureTextEntry
              placeholderTextColor="#95a5a6"
            />

            <TouchableOpacity style={styles.botonEntrar} onPress={manejarLogin}>
              <Text style={styles.textoBoton}>Iniciar Sesión</Text>
            </TouchableOpacity>
          </View>

          {/* PIE DE PÁGINA */}
          <Text style={styles.pieDePagina}>
            Aplicación de control y gestión de almacén
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  pantallaCompleta: { flex: 1, backgroundColor: "#2c3e50" },
  scrollContenedor: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  tarjetaLogin: {
    backgroundColor: "#ffffff",
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    padding: 25,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 6,
  },
  contenedorIcono: {
    backgroundColor: "#79715B",
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 15,
  },
  iconoAlmacen: { fontSize: 36 },
  tituloApp: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2c3e50",
    textAlign: "center",
    letterSpacing: 0.5,
  },
  subtituloUco: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#79715B",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 25,
    paddingHorizontal: 10,
  },
  contenedorFormulario: { width: "100%", gap: 12 },
  input: {
    backgroundColor: "#f8f9fa",
    borderWidth: 1,
    borderColor: "#dcdde1",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#2c3e50",
  },
  botonEntrar: {
    backgroundColor: "#2c3e50",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  textoBoton: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
  pieDePagina: {
    fontSize: 11,
    color: "#95a5a6",
    marginTop: 30,
    textAlign: "center",
    fontStyle: "italic",
  },
});
