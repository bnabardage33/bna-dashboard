import { POST } from "../../meteo/intemperies/route";

export const revalidate = 0;

export async function GET() {
  return POST();
}