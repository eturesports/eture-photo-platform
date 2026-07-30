export default function CheckEmailPage() {
  return (
    <div className="mx-auto max-w-md py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Revisa tu correo</h1>
      <p className="mt-3 text-muted">
        Si esa dirección tiene acceso al archivo, acabamos de enviarle un enlace. Caduca a
        los 15 minutos.
      </p>
      <p className="mt-6 text-sm text-muted">
        ¿No llega? Mira en spam. Si sigue sin aparecer, es probable que esa dirección aún
        no tenga acceso: escríbenos a hello@eturesports.com.
      </p>
    </div>
  );
}
