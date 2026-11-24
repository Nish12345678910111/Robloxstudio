import PhoneRoute from "../../../cloudflare-pages/src/shared/PhoneRoute.jsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CloudPhonePage({ params }) {
  const { id } = await params;
  return <PhoneRoute phoneId={id} />;
}
