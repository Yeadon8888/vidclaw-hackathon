import { setRequestLocale } from "next-intl/server";
import { PricingClient } from "./PricingClient";

type Props = { params: Promise<{ locale: string }> };

export default async function LocalizedPricing({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PricingClient locale={locale} />;
}
