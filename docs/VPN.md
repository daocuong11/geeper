# VPN de todo el equipo

<!-- borrador: 2026-11-18 · complemento de TRAMITES.md §0.3 -->

Objetivo: que **todo el PC** (Windows, el navegador, WSL, Geeper y el worker) salga a internet por un
solo país, el que elijas, y que no se escape nada por otra vía.

Para comprobarlo en cualquier momento:

```bash
pnpm tsx scripts/verificar-vpn.ts US   # el código ISO del país elegido
```

Revisa desde Windows y desde WSL la IP y el país de salida, la fuga por IPv6, el túnel, el DNS, el
servicio de ubicación de Windows y la zona y región. No cambia nada. Hoy (18-11-2026) da: salida por
CR, sin túnel, DNS del router y ubicación de Windows activada.

## 1. Elegir el servidor

Hace falta un servidor WireGuard **en el país elegido y con IP fija**. Hay dos opciones, y ninguna es
gratis:

| Opción | Costo aprox. | Ventaja | Desventaja |
|---|---|---|---|
| **VPS propio con WireGuard** (Hetzner, Vultr, DigitalOcean, Linode…) | US$4–6/mes | IP **dedicada y fija**, solo tuya. Las redes ven siempre la misma IP | Es una IP de centro de datos. Hay que instalarlo una vez (§3) |
| **VPN comercial que entregue archivos WireGuard** (Mullvad, Proton VPN de pago, IVPN…) | US$5–10/mes | Sin mantenimiento, muchos países | La IP es **compartida** con miles de usuarios. Algunas redes la marcan como VPN y piden verificaciones |

**Recomendación: VPS propio.** Una IP fija y exclusiva levanta menos sospechas que una IP compartida
de VPN comercial. Además, todas tus cuentas ven siempre la misma IP, que es lo que busca §0.3 de
TRAMITES.md.

Esto choca con el principio de US$0 al mes de PRODUCTO.md, así que es una decisión tuya.

> **Ojo con el resto de tus cuentas.** Con todo el equipo en otro país, también tu banco, tu Google
> personal y tus suscripciones te van a ver ahí. Algunos te pedirán verificar el inicio de sesión y
> otros (bancos, streaming) pueden bloquear el acceso. Si pasa, se apaga el túnel con un clic.

## 2. Instalar el túnel en Windows (todo el equipo)

WSL sale a internet por Windows, así que con el túnel en Windows queda cubierto todo, también Geeper.

1. Instala el cliente oficial: [wireguard.com/install](https://www.wireguard.com/install/) → Windows.
2. **Import tunnel(s) from file** → elige el `.conf` (el del VPS de §3 o el del proveedor). Ponle de
   nombre `geeper`.
3. **Edit** y revisa que el `.conf` tenga:
   ```ini
   [Interface]
   PrivateKey = (no la compartas)
   Address = 10.8.0.2/32, fd08::2/128
   DNS = 1.1.1.1, 2606:4700:4700::1111   # o el DNS del proveedor

   [Peer]
   PublicKey = …
   Endpoint = <ip-del-servidor>:51820
   AllowedIPs = 0.0.0.0/0, ::/0           # TODO el tráfico, IPv4 e IPv6
   PersistentKeepalive = 25
   ```
   - `AllowedIPs = 0.0.0.0/0, ::/0` hace que **todo** pase por el túnel. Si falta `::/0`, el tráfico
     IPv6 sale por tu conexión normal y revela tu país.
   - `DNS = …` evita la fuga de DNS: mientras el túnel está activo, Windows usa ese DNS.
4. Marca **Block untunneled traffic (kill-switch)**. Si el túnel se cae, el equipo se queda sin
   internet en vez de salir por Costa Rica.
5. **Activate.**
6. Para que arranque solo con Windows, en una terminal de **administrador**:
   ```powershell
   & "C:\Program Files\WireGuard\wireguard.exe" /installtunnelservice "C:\ruta\geeper.conf"
   ```
   Así queda como servicio y se levanta antes de iniciar sesión. Con esta opción, guarda el `.conf`
   en una carpeta que solo pueda leer tu usuario.
7. Corre `pnpm tsx scripts/verificar-vpn.ts <PAIS>`. Las líneas de salida, IPv6 y túnel deben quedar en ✓.
8. En Geeper → **Sistema → Red** pon `VPN: requerido` y el país. Así nada se publica si el túnel se cae.

## 3. Servidor propio (VPS) en el país elegido

1. Crea un VPS Ubuntu 24.04 en una región del país elegido (el plan más chico alcanza).
2. Entra por SSH y corre:
   ```bash
   sudo apt update && sudo apt install -y wireguard qrencode
   sudo sysctl -w net.ipv4.ip_forward=1 net.ipv6.conf.all.forwarding=1
   echo -e "net.ipv4.ip_forward=1\nnet.ipv6.conf.all.forwarding=1" | sudo tee /etc/sysctl.d/99-wg.conf
   cd /etc/wireguard && umask 077
   wg genkey | tee servidor.key | wg pubkey > servidor.pub
   wg genkey | tee pc.key | wg pubkey > pc.pub
   IFACE=$(ip route show default | awk '{print $5; exit}')
   cat > wg0.conf <<EOF
   [Interface]
   Address = 10.8.0.1/24, fd08::1/64
   ListenPort = 51820
   PrivateKey = $(cat servidor.key)
   PostUp = iptables -t nat -A POSTROUTING -o $IFACE -j MASQUERADE; ip6tables -t nat -A POSTROUTING -o $IFACE -j MASQUERADE
   PostDown = iptables -t nat -D POSTROUTING -o $IFACE -j MASQUERADE; ip6tables -t nat -D POSTROUTING -o $IFACE -j MASQUERADE

   [Peer]
   PublicKey = $(cat pc.pub)
   AllowedIPs = 10.8.0.2/32, fd08::2/128
   EOF
   sudo systemctl enable --now wg-quick@wg0
   sudo ufw allow 51820/udp 2>/dev/null; sudo ufw allow OpenSSH 2>/dev/null
   ```
3. Arma el `.conf` del PC con la plantilla de §2 paso 3: `PrivateKey` = el contenido de `pc.key`,
   `PublicKey` = el de `servidor.pub`, `Endpoint` = IP pública del VPS. Pásalo a Windows por un medio
   seguro (no por chat ni correo) y **borra `pc.key` del servidor** después.
4. Si el VPS no tiene IPv6, quita las partes `fd08::…` y la línea de `ip6tables`, y desactiva IPv6 en el
   adaptador de red de Windows (Panel de control → Conexiones de red → propiedades → desmarcar IPv6).
   Si no, el IPv6 de tu conexión se escaparía.

## 4. Que Windows también «esté» en ese país

El VPN cambia la IP. Hay otras señales de ubicación que no dependen de la IP:

| Señal | Dónde se cambia | ¿Hace falta? |
|---|---|---|
| **Servicio de ubicación** (Wi-Fi, GPS): los navegadores y las apps lo usan para la geolocalización | Configuración → Privacidad y seguridad → **Ubicación → desactivar** | **Sí.** Hoy está activado y revela la ubicación real aunque uses VPN |
| **Zona horaria** | Configuración → Hora e idioma → Fecha y hora → desactiva «automática» y elige la del país | Recomendado: una IP de un país con la hora de otro es incoherente |
| **País o región** | Configuración → Hora e idioma → Idioma y región → País o región | Recomendado. Hoy dice «Brasil» |
| **Formato regional e idioma** | Igual que la anterior → Formato regional | Opcional. Puedes dejar el español |
| **Idioma del navegador** | Configuración del navegador → Idiomas | Opcional |

Los horarios de Geeper se guardan en UTC, así que cambiar la zona horaria no rompe nada: solo cambia
cómo se muestran las horas.

**Lo que Geeper no hace** (está fuera de alcance, ver PUBLICAR.md §1): falsificar la huella del
navegador, usar una IP distinta por cuenta o usar proxies residenciales. El objetivo es que el equipo
esté en un país, de forma coherente, no hacerse pasar por muchos equipos.

## 5. Mantenimiento

- **Corre el verificador** después de cada actualización grande de Windows o de cambiar de red (por
  ejemplo, otro Wi-Fi).
- **Si el VPS cambia de IP**, actualiza `Endpoint` en el `.conf` y la IP esperada en Sistema → Red.
- **No cambies de país una vez creadas las cuentas.** Si hace falta, hazlo una sola vez y espera
  algunas verificaciones de inicio de sesión.
- Para **apagar el VPN** un rato, usa «Deactivate» en WireGuard. Con el kill-switch activo, al
  desactivarlo vuelve la conexión normal.
