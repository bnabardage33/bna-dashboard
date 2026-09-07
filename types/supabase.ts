export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      articles: {
        Row: {
          code_decor: string | null
          created_at: string
          designation_raw: string
          epaisseur_mm: number | null
          fabricant: string | null
          finition: string | null
          fournisseur: string
          gamme: string | null
          id: string
          largeur_mm: number | null
          longueur_mm: number | null
          nom_decor: string | null
          prix_ht: number | null
          prix_ttc: number | null
          reference: string
          updated_at: string
        }
        Insert: {
          code_decor?: string | null
          created_at?: string
          designation_raw: string
          epaisseur_mm?: number | null
          fabricant?: string | null
          finition?: string | null
          fournisseur: string
          gamme?: string | null
          id?: string
          largeur_mm?: number | null
          longueur_mm?: number | null
          nom_decor?: string | null
          prix_ht?: number | null
          prix_ttc?: number | null
          reference: string
          updated_at?: string
        }
        Update: {
          code_decor?: string | null
          created_at?: string
          designation_raw?: string
          epaisseur_mm?: number | null
          fabricant?: string | null
          finition?: string | null
          fournisseur?: string
          gamme?: string | null
          id?: string
          largeur_mm?: number | null
          longueur_mm?: number | null
          nom_decor?: string | null
          prix_ht?: number | null
          prix_ttc?: number | null
          reference?: string
          updated_at?: string
        }
        Relationships: []
      }
      avancements_chantier: {
        Row: {
          chantier_id: string | null
          commentaire: string | null
          created_at: string | null
          date: string
          details: Json | null
          id: string
          pourcentage: number
        }
        Insert: {
          chantier_id?: string | null
          commentaire?: string | null
          created_at?: string | null
          date: string
          details?: Json | null
          id?: string
          pourcentage: number
        }
        Update: {
          chantier_id?: string | null
          commentaire?: string | null
          created_at?: string | null
          date?: string
          details?: Json | null
          id?: string
          pourcentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "avancements_chantier_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_ouvrages: {
        Row: {
          categorie: string
          code_decor: string | null
          couleur: string | null
          cree_le: string | null
          description: string | null
          designation: string
          dimensions_disponibles: Json | null
          epaisseur_mm: number | null
          fabricant: string | null
          famille_label: string
          finition: string | null
          fournisseur: string | null
          gamme: string | null
          id: string
          largeur_mm: number | null
          longueur_mm: number | null
          prix_ttc: number | null
          pu_ht: number
          unite: string
        }
        Insert: {
          categorie: string
          code_decor?: string | null
          couleur?: string | null
          cree_le?: string | null
          description?: string | null
          designation: string
          dimensions_disponibles?: Json | null
          epaisseur_mm?: number | null
          fabricant?: string | null
          famille_label: string
          finition?: string | null
          fournisseur?: string | null
          gamme?: string | null
          id?: string
          largeur_mm?: number | null
          longueur_mm?: number | null
          prix_ttc?: number | null
          pu_ht: number
          unite: string
        }
        Update: {
          categorie?: string
          code_decor?: string | null
          couleur?: string | null
          cree_le?: string | null
          description?: string | null
          designation?: string
          dimensions_disponibles?: Json | null
          epaisseur_mm?: number | null
          fabricant?: string | null
          famille_label?: string
          finition?: string | null
          fournisseur?: string | null
          gamme?: string | null
          id?: string
          largeur_mm?: number | null
          longueur_mm?: number | null
          prix_ttc?: number | null
          pu_ht?: number
          unite?: string
        }
        Relationships: []
      }
      catalogue_temps: {
        Row: {
          id: string
          nom_tache: string
          temps_unitaire_heure: number
        }
        Insert: {
          id?: string
          nom_tache: string
          temps_unitaire_heure: number
        }
        Update: {
          id?: string
          nom_tache?: string
          temps_unitaire_heure?: number
        }
        Relationships: []
      }
      chantier_zones: {
        Row: {
          angle: boolean
          chantier_id: string | null
          created_at: string | null
          famille_pose: string | null
          hauteur_faite: number | null
          hauteur_mur: number
          id: string
          largeur: number
          largeur_lame_mm: number | null
          materiau: string
          nom: string
          ouvertures: Json
          plaque_largeur_mm: number | null
          plaque_longueur_mm: number | null
          sens_pose: string | null
          type: string
        }
        Insert: {
          angle?: boolean
          chantier_id?: string | null
          created_at?: string | null
          famille_pose?: string | null
          hauteur_faite?: number | null
          hauteur_mur?: number
          id?: string
          largeur?: number
          largeur_lame_mm?: number | null
          materiau?: string
          nom?: string
          ouvertures?: Json
          plaque_largeur_mm?: number | null
          plaque_longueur_mm?: number | null
          sens_pose?: string | null
          type?: string
        }
        Update: {
          angle?: boolean
          chantier_id?: string | null
          created_at?: string | null
          famille_pose?: string | null
          hauteur_faite?: number | null
          hauteur_mur?: number
          id?: string
          largeur?: number
          largeur_lame_mm?: number | null
          materiau?: string
          nom?: string
          ouvertures?: Json
          plaque_largeur_mm?: number | null
          plaque_longueur_mm?: number | null
          sens_pose?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chantier_zones_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      chantiers: {
        Row: {
          adresse_chantier: string | null
          checklist: Json | null
          client_id: string | null
          client_nom: string | null
          code_acces: string | null
          coef_perte_rendement: number | null
          contact_chantier: string | null
          created_at: string | null
          date_debut: string | null
          date_fin: string | null
          horaires: string | null
          id: string
          materiau_structurel: string
          moyen_acces: string
          nom: string | null
          notes_terrain: string | null
          prix_vente_ht: number | null
          quantite_coupes_ml: number | null
          singularites_nb: number | null
          statut: string | null
          surface_m2: number | null
          zone_vent: number
        }
        Insert: {
          adresse_chantier?: string | null
          checklist?: Json | null
          client_id?: string | null
          client_nom?: string | null
          code_acces?: string | null
          coef_perte_rendement?: number | null
          contact_chantier?: string | null
          created_at?: string | null
          date_debut?: string | null
          date_fin?: string | null
          horaires?: string | null
          id?: string
          materiau_structurel?: string
          moyen_acces?: string
          nom?: string | null
          notes_terrain?: string | null
          prix_vente_ht?: number | null
          quantite_coupes_ml?: number | null
          singularites_nb?: number | null
          statut?: string | null
          surface_m2?: number | null
          zone_vent?: number
        }
        Update: {
          adresse_chantier?: string | null
          checklist?: Json | null
          client_id?: string | null
          client_nom?: string | null
          code_acces?: string | null
          coef_perte_rendement?: number | null
          contact_chantier?: string | null
          created_at?: string | null
          date_debut?: string | null
          date_fin?: string | null
          horaires?: string | null
          id?: string
          materiau_structurel?: string
          moyen_acces?: string
          nom?: string | null
          notes_terrain?: string | null
          prix_vente_ht?: number | null
          quantite_coupes_ml?: number | null
          singularites_nb?: number | null
          statut?: string | null
          surface_m2?: number | null
          zone_vent?: number
        }
        Relationships: [
          {
            foreignKeyName: "chantiers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          adresse_facturation: string | null
          code_postal: string | null
          created_at: string | null
          email: string | null
          id: string
          nom: string
          siret: string | null
          societe: string | null
          tel: string | null
          type: string
          ville: string | null
        }
        Insert: {
          adresse_facturation?: string | null
          code_postal?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nom: string
          siret?: string | null
          societe?: string | null
          tel?: string | null
          type?: string
          ville?: string | null
        }
        Update: {
          adresse_facturation?: string | null
          code_postal?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nom?: string
          siret?: string | null
          societe?: string | null
          tel?: string | null
          type?: string
          ville?: string | null
        }
        Relationships: []
      }
      commandes: {
        Row: {
          chantier_id: string | null
          created_at: string | null
          date_livraison_prevue: string | null
          date_livraison_reelle: string | null
          designation: string
          fournisseur_id: string | null
          id: string
          montant_ht: number | null
          notes: string | null
          quantite: number | null
          statut: string
          unite: string | null
        }
        Insert: {
          chantier_id?: string | null
          created_at?: string | null
          date_livraison_prevue?: string | null
          date_livraison_reelle?: string | null
          designation: string
          fournisseur_id?: string | null
          id?: string
          montant_ht?: number | null
          notes?: string | null
          quantite?: number | null
          statut?: string
          unite?: string | null
        }
        Update: {
          chantier_id?: string | null
          created_at?: string | null
          date_livraison_prevue?: string | null
          date_livraison_reelle?: string | null
          designation?: string
          fournisseur_id?: string | null
          id?: string
          montant_ht?: number | null
          notes?: string | null
          quantite?: number | null
          statut?: string
          unite?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commandes_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commandes_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
        ]
      }
      depenses_chantier: {
        Row: {
          chantier_id: string | null
          created_at: string | null
          date: string
          document_url: string | null
          fournisseur_id: string | null
          id: string
          montant_ht: number
          montant_tva: number | null
          nature: string
          statut: string | null
          taux_tva: number | null
        }
        Insert: {
          chantier_id?: string | null
          created_at?: string | null
          date: string
          document_url?: string | null
          fournisseur_id?: string | null
          id?: string
          montant_ht: number
          montant_tva?: number | null
          nature: string
          statut?: string | null
          taux_tva?: number | null
        }
        Update: {
          chantier_id?: string | null
          created_at?: string | null
          date?: string
          document_url?: string | null
          fournisseur_id?: string | null
          id?: string
          montant_ht?: number
          montant_tva?: number | null
          nature?: string
          statut?: string | null
          taux_tva?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "depenses_chantier_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "depenses_chantier_fournisseur_id_fkey"
            columns: ["fournisseur_id"]
            isOneToOne: false
            referencedRelation: "fournisseurs"
            referencedColumns: ["id"]
          },
        ]
      }
      devis: {
        Row: {
          acompte_pct: number | null
          adresse_chantier: string | null
          chantier_id: string | null
          client_id: string | null
          created_at: string | null
          date_emission: string | null
          delai_jours: number | null
          id: string
          lignes: Json
          numero: string
          objet: string | null
          statut: string
          tva_pct: number
          type_travaux: string | null
          validite_jours: number | null
        }
        Insert: {
          acompte_pct?: number | null
          adresse_chantier?: string | null
          chantier_id?: string | null
          client_id?: string | null
          created_at?: string | null
          date_emission?: string | null
          delai_jours?: number | null
          id?: string
          lignes?: Json
          numero: string
          objet?: string | null
          statut?: string
          tva_pct?: number
          type_travaux?: string | null
          validite_jours?: number | null
        }
        Update: {
          acompte_pct?: number | null
          adresse_chantier?: string | null
          chantier_id?: string | null
          client_id?: string | null
          created_at?: string | null
          date_emission?: string | null
          delai_jours?: number | null
          id?: string
          lignes?: Json
          numero?: string
          objet?: string | null
          statut?: string
          tva_pct?: number
          type_travaux?: string | null
          validite_jours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "devis_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devis_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      documents_compta: {
        Row: {
          created_at: string
          date: string
          id: string
          montant_ht: number
          montant_ttc: number
          montant_tva: number
          note: string | null
          taux_tva: number
          type: string
          url_image: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          montant_ht?: number
          montant_ttc?: number
          montant_tva?: number
          note?: string | null
          taux_tva?: number
          type: string
          url_image: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          montant_ht?: number
          montant_ttc?: number
          montant_tva?: number
          note?: string | null
          taux_tva?: number
          type?: string
          url_image?: string
        }
        Relationships: []
      }
      entreprise_settings: {
        Row: {
          adresse: string | null
          assurance: string | null
          assurance_nom: string | null
          assurance_numero_police: string | null
          assurance_zone_geo: string | null
          bic: string | null
          code_postal: string | null
          created_at: string | null
          email: string | null
          iban: string | null
          id: number
          logo_url: string | null
          mediateur_contact: string | null
          mediateur_nom: string | null
          mentions_legales: string | null
          raison_sociale: string
          seuil_ca: number | null
          siret: string | null
          taux_cotisations: number | null
          telephone: string | null
          ville: string | null
        }
        Insert: {
          adresse?: string | null
          assurance?: string | null
          assurance_nom?: string | null
          assurance_numero_police?: string | null
          assurance_zone_geo?: string | null
          bic?: string | null
          code_postal?: string | null
          created_at?: string | null
          email?: string | null
          iban?: string | null
          id?: number
          logo_url?: string | null
          mediateur_contact?: string | null
          mediateur_nom?: string | null
          mentions_legales?: string | null
          raison_sociale?: string
          seuil_ca?: number | null
          siret?: string | null
          taux_cotisations?: number | null
          telephone?: string | null
          ville?: string | null
        }
        Update: {
          adresse?: string | null
          assurance?: string | null
          assurance_nom?: string | null
          assurance_numero_police?: string | null
          assurance_zone_geo?: string | null
          bic?: string | null
          code_postal?: string | null
          created_at?: string | null
          email?: string | null
          iban?: string | null
          id?: number
          logo_url?: string | null
          mediateur_contact?: string | null
          mediateur_nom?: string | null
          mentions_legales?: string | null
          raison_sociale?: string
          seuil_ca?: number | null
          siret?: string | null
          taux_cotisations?: number | null
          telephone?: string | null
          ville?: string | null
        }
        Relationships: []
      }
      equipe: {
        Row: {
          id: string
          nom: string
          prenom: string
          role: string
        }
        Insert: {
          id: string
          nom: string
          prenom: string
          role: string
        }
        Update: {
          id?: string
          nom?: string
          prenom?: string
          role?: string
        }
        Relationships: []
      }
      factures: {
        Row: {
          adresse_chantier: string | null
          chantier_id: string | null
          client_id: string | null
          created_at: string | null
          date_emission: string | null
          devis_id: string | null
          echeance: string | null
          id: string
          lignes: Json
          numero: string
          objet: string | null
          statut: string
          tva_pct: number
          type_facture: string
          type_travaux: string | null
        }
        Insert: {
          adresse_chantier?: string | null
          chantier_id?: string | null
          client_id?: string | null
          created_at?: string | null
          date_emission?: string | null
          devis_id?: string | null
          echeance?: string | null
          id?: string
          lignes?: Json
          numero: string
          objet?: string | null
          statut?: string
          tva_pct?: number
          type_facture?: string
          type_travaux?: string | null
        }
        Update: {
          adresse_chantier?: string | null
          chantier_id?: string | null
          client_id?: string | null
          created_at?: string | null
          date_emission?: string | null
          devis_id?: string | null
          echeance?: string | null
          id?: string
          lignes?: Json
          numero?: string
          objet?: string | null
          statut?: string
          tva_pct?: number
          type_facture?: string
          type_travaux?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "factures_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factures_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "factures_devis_id_fkey"
            columns: ["devis_id"]
            isOneToOne: false
            referencedRelation: "devis"
            referencedColumns: ["id"]
          },
        ]
      }
      fiches_techniques: {
        Row: {
          categorie: string
          contenu: string | null
          created_at: string | null
          fichier_url: string | null
          id: string
          reference: string | null
          resume: string | null
          titre: string
        }
        Insert: {
          categorie?: string
          contenu?: string | null
          created_at?: string | null
          fichier_url?: string | null
          id?: string
          reference?: string | null
          resume?: string | null
          titre: string
        }
        Update: {
          categorie?: string
          contenu?: string | null
          created_at?: string | null
          fichier_url?: string | null
          id?: string
          reference?: string | null
          resume?: string | null
          titre?: string
        }
        Relationships: []
      }
      fournisseurs: {
        Row: {
          conditions_paiement: string | null
          contact: string | null
          created_at: string | null
          email: string | null
          id: string
          nom: string
          notes: string | null
          specialite: string | null
          statut_relation: string
          telephone: string | null
        }
        Insert: {
          conditions_paiement?: string | null
          contact?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nom: string
          notes?: string | null
          specialite?: string | null
          statut_relation?: string
          telephone?: string | null
        }
        Update: {
          conditions_paiement?: string | null
          contact?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nom?: string
          notes?: string | null
          specialite?: string | null
          statut_relation?: string
          telephone?: string | null
        }
        Relationships: []
      }
      frais_interim: {
        Row: {
          agence_nom: string
          chantier_id: string | null
          coefficient: number
          created_at: string | null
          date: string
          id: string
          interimaire_nom: string
          montant_tva: number | null
          salaire_brut: number
          taux_tva: number
          total_ht: number | null
          total_ttc: number | null
        }
        Insert: {
          agence_nom: string
          chantier_id?: string | null
          coefficient?: number
          created_at?: string | null
          date?: string
          id?: string
          interimaire_nom: string
          montant_tva?: number | null
          salaire_brut: number
          taux_tva?: number
          total_ht?: number | null
          total_ttc?: number | null
        }
        Update: {
          agence_nom?: string
          chantier_id?: string | null
          coefficient?: number
          created_at?: string | null
          date?: string
          id?: string
          interimaire_nom?: string
          montant_tva?: number | null
          salaire_brut?: number
          taux_tva?: number
          total_ht?: number | null
          total_ttc?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "frais_interim_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_chantier: {
        Row: {
          chantier_id: string | null
          contenu: string
          created_at: string
          id: string
          source: string | null
        }
        Insert: {
          chantier_id?: string | null
          contenu: string
          created_at?: string
          id?: string
          source?: string | null
        }
        Update: {
          chantier_id?: string | null
          contenu?: string
          created_at?: string
          id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_chantier_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      lignes_commande: {
        Row: {
          article_id: string
          commande_id: string
          fournisseur_id: string
          id: string
          prix_unitaire: number
          quantite: number
          total_ligne: number
        }
        Insert: {
          article_id: string
          commande_id: string
          fournisseur_id: string
          id?: string
          prix_unitaire: number
          quantite: number
          total_ligne: number
        }
        Update: {
          article_id?: string
          commande_id?: string
          fournisseur_id?: string
          id?: string
          prix_unitaire?: number
          quantite?: number
          total_ligne?: number
        }
        Relationships: [
          {
            foreignKeyName: "lignes_commande_commande_id_fkey"
            columns: ["commande_id"]
            isOneToOne: false
            referencedRelation: "commandes"
            referencedColumns: ["id"]
          },
        ]
      }
      meteo_log: {
        Row: {
          chantier_id: string | null
          created_at: string | null
          date: string | null
          id: string
          location: string | null
          pluie: number | null
          rafales: number | null
          temp: number | null
          vent: number | null
        }
        Insert: {
          chantier_id?: string | null
          created_at?: string | null
          date?: string | null
          id?: string
          location?: string | null
          pluie?: number | null
          rafales?: number | null
          temp?: number | null
          vent?: number | null
        }
        Update: {
          chantier_id?: string | null
          created_at?: string | null
          date?: string | null
          id?: string
          location?: string | null
          pluie?: number | null
          rafales?: number | null
          temp?: number | null
          vent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meteo_log_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      notes_patron: {
        Row: {
          contenu: string
          created_at: string | null
          epingle: boolean
          id: string
          titre: string | null
          updated_at: string | null
        }
        Insert: {
          contenu: string
          created_at?: string | null
          epingle?: boolean
          id?: string
          titre?: string | null
          updated_at?: string | null
        }
        Update: {
          contenu?: string
          created_at?: string | null
          epingle?: boolean
          id?: string
          titre?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          destinataire_id: string | null
          id: string
          lien: string | null
          lu: boolean | null
          message: string | null
          titre: string
          type: string
        }
        Insert: {
          created_at?: string | null
          destinataire_id?: string | null
          id?: string
          lien?: string | null
          lu?: boolean | null
          message?: string | null
          titre: string
          type: string
        }
        Update: {
          created_at?: string | null
          destinataire_id?: string | null
          id?: string
          lien?: string | null
          lu?: boolean | null
          message?: string | null
          titre?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_destinataire_id_fkey"
            columns: ["destinataire_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parametres_finance: {
        Row: {
          cle: string
          created_at: string | null
          id: string
          valeur: number
        }
        Insert: {
          cle: string
          created_at?: string | null
          id?: string
          valeur?: number
        }
        Update: {
          cle?: string
          created_at?: string | null
          id?: string
          valeur?: number
        }
        Relationships: []
      }
      photos: {
        Row: {
          chantier_id: string | null
          date_prise: string | null
          id: string
          type: string
          url: string
        }
        Insert: {
          chantier_id?: string | null
          date_prise?: string | null
          id?: string
          type: string
          url: string
        }
        Update: {
          chantier_id?: string | null
          date_prise?: string | null
          id?: string
          type?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      photos_chantier: {
        Row: {
          chantier_id: string
          date_ajout: string | null
          id: string
          titre: string
          url_image: string
        }
        Insert: {
          chantier_id: string
          date_ajout?: string | null
          id?: string
          titre?: string
          url_image: string
        }
        Update: {
          chantier_id?: string
          date_ajout?: string | null
          id?: string
          titre?: string
          url_image?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_chantier_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      pointages: {
        Row: {
          chantier_id: string | null
          created_at: string | null
          date: string
          heures: number
          id: string
          taux_horaire_charge: number
          type_heure: string | null
          user_id: string | null
        }
        Insert: {
          chantier_id?: string | null
          created_at?: string | null
          date: string
          heures: number
          id?: string
          taux_horaire_charge?: number
          type_heure?: string | null
          user_id?: string | null
        }
        Update: {
          chantier_id?: string | null
          created_at?: string | null
          date?: string
          heures?: number
          id?: string
          taux_horaire_charge?: number
          type_heure?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pointages_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pointages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pointages_globaux: {
        Row: {
          chantier_id: string | null
          coef_meteo: number | null
          commentaire: string | null
          date_saisie: string
          equipe_id: string | null
          id: string
          meteo_relevee: string | null
          volume_heures_declare: number
        }
        Insert: {
          chantier_id?: string | null
          coef_meteo?: number | null
          commentaire?: string | null
          date_saisie?: string
          equipe_id?: string | null
          id?: string
          meteo_relevee?: string | null
          volume_heures_declare: number
        }
        Update: {
          chantier_id?: string | null
          coef_meteo?: number | null
          commentaire?: string | null
          date_saisie?: string
          equipe_id?: string | null
          id?: string
          meteo_relevee?: string | null
          volume_heures_declare?: number
        }
        Relationships: [
          {
            foreignKeyName: "pointages_globaux_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pointages_globaux_equipe_id_fkey"
            columns: ["equipe_id"]
            isOneToOne: false
            referencedRelation: "equipe"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          full_name: string
          id: string
          qualification: string | null
          role: string | null
          statut_emploi: string | null
        }
        Insert: {
          created_at?: string | null
          full_name: string
          id?: string
          qualification?: string | null
          role?: string | null
          statut_emploi?: string | null
        }
        Update: {
          created_at?: string | null
          full_name?: string
          id?: string
          qualification?: string | null
          role?: string | null
          statut_emploi?: string | null
        }
        Relationships: []
      }
      pv_receptions: {
        Row: {
          adresse_chantier: string | null
          chantier_id: string | null
          checklist_repli: Json | null
          client_id: string | null
          created_at: string | null
          date_reception: string
          devis_id: string | null
          id: string
          materiaux_utilises: string | null
          notice_entretien: Json | null
          numero: string
          observations: string | null
          photos: Json | null
          reserves: Json | null
          signataire_client_nom: string | null
          signataire_entreprise_nom: string | null
          signature_client: string | null
          signature_entreprise: string | null
          statut: string
          type_travaux: string | null
          zones_metres: Json | null
        }
        Insert: {
          adresse_chantier?: string | null
          chantier_id?: string | null
          checklist_repli?: Json | null
          client_id?: string | null
          created_at?: string | null
          date_reception?: string
          devis_id?: string | null
          id?: string
          materiaux_utilises?: string | null
          notice_entretien?: Json | null
          numero: string
          observations?: string | null
          photos?: Json | null
          reserves?: Json | null
          signataire_client_nom?: string | null
          signataire_entreprise_nom?: string | null
          signature_client?: string | null
          signature_entreprise?: string | null
          statut?: string
          type_travaux?: string | null
          zones_metres?: Json | null
        }
        Update: {
          adresse_chantier?: string | null
          chantier_id?: string | null
          checklist_repli?: Json | null
          client_id?: string | null
          created_at?: string | null
          date_reception?: string
          devis_id?: string | null
          id?: string
          materiaux_utilises?: string | null
          notice_entretien?: Json | null
          numero?: string
          observations?: string | null
          photos?: Json | null
          reserves?: Json | null
          signataire_client_nom?: string | null
          signataire_entreprise_nom?: string | null
          signature_client?: string | null
          signature_entreprise?: string | null
          statut?: string
          type_travaux?: string | null
          zones_metres?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pv_receptions_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pv_receptions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pv_receptions_devis_id_fkey"
            columns: ["devis_id"]
            isOneToOne: false
            referencedRelation: "devis"
            referencedColumns: ["id"]
          },
        ]
      }
      rapports_intemperies: {
        Row: {
          a_valider: boolean
          acces: string | null
          ampleur_impact: string | null
          chantier_id: string
          cree_le: string
          cree_par: string
          departement: string | null
          id: string
          jour_arrete: boolean
          materiau: string | null
          mesures_prises: string | null
          motif: string
          numero: string
          pluie_continue: boolean
          pluie_cumul: number | null
          rafales_max: number | null
          releve_horaire: Json | null
          risque_technique_motif: string | null
          risque_technique_niveau: string | null
          temp_max: number | null
          valide_le: string | null
          valide_par: string | null
          vigilance_officielle: string
        }
        Insert: {
          a_valider?: boolean
          acces?: string | null
          ampleur_impact?: string | null
          chantier_id: string
          cree_le?: string
          cree_par?: string
          departement?: string | null
          id?: string
          jour_arrete?: boolean
          materiau?: string | null
          mesures_prises?: string | null
          motif: string
          numero: string
          pluie_continue?: boolean
          pluie_cumul?: number | null
          rafales_max?: number | null
          releve_horaire?: Json | null
          risque_technique_motif?: string | null
          risque_technique_niveau?: string | null
          temp_max?: number | null
          valide_le?: string | null
          valide_par?: string | null
          vigilance_officielle: string
        }
        Update: {
          a_valider?: boolean
          acces?: string | null
          ampleur_impact?: string | null
          chantier_id?: string
          cree_le?: string
          cree_par?: string
          departement?: string | null
          id?: string
          jour_arrete?: boolean
          materiau?: string | null
          mesures_prises?: string | null
          motif?: string
          numero?: string
          pluie_continue?: boolean
          pluie_cumul?: number | null
          rafales_max?: number | null
          releve_horaire?: Json | null
          risque_technique_motif?: string | null
          risque_technique_niveau?: string | null
          temp_max?: number | null
          valide_le?: string | null
          valide_par?: string | null
          vigilance_officielle?: string
        }
        Relationships: [
          {
            foreignKeyName: "rapports_intemperies_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      situations: {
        Row: {
          chantier_id: string | null
          date_echeance: string | null
          date_emission: string | null
          id: string
          montant_ht: number
          montant_ttc: number
          numero: string
          pourcentage: number | null
          statut: string | null
          type: string
        }
        Insert: {
          chantier_id?: string | null
          date_echeance?: string | null
          date_emission?: string | null
          id?: string
          montant_ht: number
          montant_ttc: number
          numero: string
          pourcentage?: number | null
          statut?: string | null
          type: string
        }
        Update: {
          chantier_id?: string | null
          date_echeance?: string | null
          date_emission?: string | null
          id?: string
          montant_ht?: number
          montant_ttc?: number
          numero?: string
          pourcentage?: number | null
          statut?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "situations_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets_sav: {
        Row: {
          cause_probable: string | null
          chantier_id: string | null
          created_at: string | null
          date_intervention: string | null
          description: string | null
          diagnostic_dtu: string | null
          id: string
          intervenant: string | null
          localisation: string | null
          materiel_prevu: Json | null
          moyen_acces: string | null
          photos: Json | null
          respect_dtu: boolean | null
          signature_client: string | null
          signature_technicien: string | null
          sous_garantie: boolean | null
          statut: string | null
          temps_estime: string | null
          type_sinistre: string | null
          updated_at: string | null
        }
        Insert: {
          cause_probable?: string | null
          chantier_id?: string | null
          created_at?: string | null
          date_intervention?: string | null
          description?: string | null
          diagnostic_dtu?: string | null
          id?: string
          intervenant?: string | null
          localisation?: string | null
          materiel_prevu?: Json | null
          moyen_acces?: string | null
          photos?: Json | null
          respect_dtu?: boolean | null
          signature_client?: string | null
          signature_technicien?: string | null
          sous_garantie?: boolean | null
          statut?: string | null
          temps_estime?: string | null
          type_sinistre?: string | null
          updated_at?: string | null
        }
        Update: {
          cause_probable?: string | null
          chantier_id?: string | null
          created_at?: string | null
          date_intervention?: string | null
          description?: string | null
          diagnostic_dtu?: string | null
          id?: string
          intervenant?: string | null
          localisation?: string | null
          materiel_prevu?: Json | null
          moyen_acces?: string | null
          photos?: Json | null
          respect_dtu?: boolean | null
          signature_client?: string | null
          signature_technicien?: string | null
          sous_garantie?: boolean | null
          statut?: string | null
          temps_estime?: string | null
          type_sinistre?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_sav_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
      vigilance_captures: {
        Row: {
          capture_le: string
          chantier_id: string
          departement: string | null
          id: string
          periode: string
          vigilance_couleur: string
          vigilance_phenomenes: Json | null
        }
        Insert: {
          capture_le?: string
          chantier_id: string
          departement?: string | null
          id?: string
          periode: string
          vigilance_couleur: string
          vigilance_phenomenes?: Json | null
        }
        Update: {
          capture_le?: string
          chantier_id?: string
          departement?: string | null
          id?: string
          periode?: string
          vigilance_couleur?: string
          vigilance_phenomenes?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "vigilance_captures_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      rapports_intemperies_jours_arretes: {
        Row: {
          a_valider: boolean | null
          acces: string | null
          chantier_id: string | null
          cree_le: string | null
          cree_par: string | null
          departement: string | null
          id: string | null
          jour_arrete: boolean | null
          materiau: string | null
          mesures_prises: string | null
          motif: string | null
          numero: string | null
          pluie_continue: boolean | null
          pluie_cumul: number | null
          rafales_max: number | null
          risque_technique_motif: string | null
          risque_technique_niveau: string | null
          temp_max: number | null
          valide_le: string | null
          valide_par: string | null
          vigilance_officielle: string | null
        }
        Insert: {
          a_valider?: boolean | null
          acces?: string | null
          chantier_id?: string | null
          cree_le?: string | null
          cree_par?: string | null
          departement?: string | null
          id?: string | null
          jour_arrete?: boolean | null
          materiau?: string | null
          mesures_prises?: string | null
          motif?: string | null
          numero?: string | null
          pluie_continue?: boolean | null
          pluie_cumul?: number | null
          rafales_max?: number | null
          risque_technique_motif?: string | null
          risque_technique_niveau?: string | null
          temp_max?: number | null
          valide_le?: string | null
          valide_par?: string | null
          vigilance_officielle?: string | null
        }
        Update: {
          a_valider?: boolean | null
          acces?: string | null
          chantier_id?: string | null
          cree_le?: string | null
          cree_par?: string | null
          departement?: string | null
          id?: string | null
          jour_arrete?: boolean | null
          materiau?: string | null
          mesures_prises?: string | null
          motif?: string | null
          numero?: string | null
          pluie_continue?: boolean | null
          pluie_cumul?: number | null
          rafales_max?: number | null
          risque_technique_motif?: string | null
          risque_technique_niveau?: string | null
          temp_max?: number | null
          valide_le?: string | null
          valide_par?: string | null
          vigilance_officielle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rapports_intemperies_chantier_id_fkey"
            columns: ["chantier_id"]
            isOneToOne: false
            referencedRelation: "chantiers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

