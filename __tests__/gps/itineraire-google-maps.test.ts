// __tests__/gps/itineraire-google-maps.test.ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { genererUrlItineraireGoogleMaps } from "@/lib/gps/itineraireGoogleMaps";

describe("OBJECTIF 1 — GPS Itinéraire Réel (Google Maps Directions API)", () => {
  describe("1. Fonction utilitaire genererUrlItineraireGoogleMaps", () => {
    it("génère une URL Directions valide pour une adresse standard", () => {
      const adresse = "14 Rue des Artisans, 33000 Bordeaux";
      const url = genererUrlItineraireGoogleMaps(adresse);

      expect(url).toBe(
        "https://www.google.com/maps/dir/?api=1&destination=14%20Rue%20des%20Artisans%2C%2033000%20Bordeaux&travelmode=driving"
      );
    });

    it("encode rigoureusement les caractères spéciaux, accents et apostrophes", () => {
      const adresse = "Allée de l'Étang & Résidence Saint-François, 64200 Biarritz";
      const url = genererUrlItineraireGoogleMaps(adresse);

      expect(url).not.toBeNull();
      expect(url).toContain("https://www.google.com/maps/dir/?api=1&destination=");
      expect(url).toContain("travelmode=driving");

      // Vérifie que les caractères spéciaux sont percent-encodés
      expect(url).toContain(encodeURIComponent(adresse));
      expect(url).not.toContain(" ");
      expect(url).not.toContain("É");
      expect(url).toContain("%26");
      expect(url).toContain("&travelmode=driving");
    });

    it("renvoie null pour les adresses vides, nulles ou non renseignées", () => {
      expect(genererUrlItineraireGoogleMaps(null)).toBeNull();
      expect(genererUrlItineraireGoogleMaps(undefined)).toBeNull();
      expect(genererUrlItineraireGoogleMaps("")).toBeNull();
      expect(genererUrlItineraireGoogleMaps("   ")).toBeNull();
    });

    it("impose systématiquement le mode conduite (travelmode=driving)", () => {
      const url = genererUrlItineraireGoogleMaps("10 Place de la Comédie, 33000 Bordeaux");
      expect(url).toContain("travelmode=driving");
    });

    it("omet le paramètre origin afin que Google Maps utilise la position GPS temps réel de l'artisan", () => {
      const url = genererUrlItineraireGoogleMaps("10 Place de la Comédie, 33000 Bordeaux");
      expect(url).not.toContain("origin=");
    });
  });

  describe("2. Application conforme sur les cartes Bardage (/terrain/chantier)", () => {
    const pagePath = path.resolve(process.cwd(), "app/terrain/chantier/page.tsx");
    const content = fs.readFileSync(pagePath, "utf-8");

    it("utilise le schéma d'URL réel Google Maps Directions", () => {
      expect(content).toContain("google.com/maps/dir/?api=1&destination=");
      expect(content).toContain("travelmode=driving");
      expect(content).not.toContain("google.com/maps/search/?api=1&query=");
    });

    it("encode l'adresse avec encodeURIComponent sans concaténation brute", () => {
      expect(content).toContain("encodeURIComponent(ch.adresse_chantier)");
    });

    it("gère l'état inactif explicite lorsque l'adresse est absente", () => {
      expect(content).toContain("Adresse non renseignée — navigation indisponible");
      expect(content).toContain("cursor-not-allowed");
    });
  });

  describe("3. Application conforme sur les cartes Terrasse (/terrain/terrasse)", () => {
    const pagePath = path.resolve(process.cwd(), "app/terrain/terrasse/page.tsx");
    const content = fs.readFileSync(pagePath, "utf-8");

    it("utilise le schéma d'URL réel Google Maps Directions", () => {
      expect(content).toContain("google.com/maps/dir/?api=1&destination=");
      expect(content).toContain("travelmode=driving");
    });

    it("encode l'adresse avec encodeURIComponent sans concaténation brute", () => {
      expect(content).toContain("encodeURIComponent(c.adresse_chantier)");
    });

    it("gère l'état inactif explicite lorsque l'adresse est absente", () => {
      expect(content).toContain("Adresse non renseignée — navigation indisponible");
      expect(content).toContain("cursor-not-allowed");
    });
  });

  describe("4. Non-régression comptable & intégrité des déplacements", () => {
    it("ne modifie ni n'altère la table frais_deplacement", () => {
      const utilPath = path.resolve(process.cwd(), "lib/gps/itineraireGoogleMaps.ts");
      const utilContent = fs.readFileSync(utilPath, "utf-8");

      expect(utilContent).not.toContain("frais_deplacement");
    });
  });
});
