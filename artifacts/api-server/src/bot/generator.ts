/**
 * Generates a list of ICP-themed Discord usernames.
 * Rules: ≤15 chars, optional single underscore, ICP-related.
 */

const STANDALONE: string[] = [
  "ViolentJ", "Shaggy2Dope", "ICP_Juggalo", "TheJuggalo", "TheNinja",
  "TheHatchet", "TheClown", "TheWicked", "TheJoker", "TheLotus",
  "JuggaloNation", "JuggaloFamily", "JuggaloKilla", "JuggaloLife",
  "JuggaloDown", "JuggaloPosse", "JuggaloCrew", "JuggaloGang",
  "JuggaHommie", "JuggaKilla", "JuggaNinja", "JuggaDown", "JuggaPosse",
  "HatchetMan", "HatchetNinja", "HatchetKilla", "HatchetGang",
  "FaygoLover", "FaygoNinja", "FaygoKilla", "FaygoNation",
  "WickedClown", "WickedNinja", "WickedKilla", "WickedDown",
  "DarkCarnival", "DarkLotus", "DarkNinja", "DarkClown", "DarkKilla",
  "DarkJuggalo", "DarkHatchet",
  "ICPNinja", "ICPKilla", "ICPFaygo", "ICPClown", "ICPLotus",
  "ICPHatchet", "ICPCarnival", "ICPWicked", "ICPDark", "ICPForever",
  "ICP_Nation", "ICP_Killa", "ICP_Ninja", "ICP_Clown", "ICP_Dark",
  "ICP_Lotus", "ICP_Faygo",
  "Violent_J", "Violent_Ninja", "Violent_Killa", "Violent_Clown",
  "Shaggy_Dope", "Shaggy_Ninja", "Shaggy_Killa",
  "NinjaJuggalo", "NinjaKilla", "NinjaClown", "NinjaDown",
  "ClownNinja", "ClownKilla", "ClownDown", "ClownPosse",
  "KillaJuggalo", "KillaNinja", "KillaClown", "KillaDown",
  "DownWithICP", "DownJuggalo", "DownWICP",
  "LotusNinja", "LotusKilla", "LotusFamily", "LotusJuggalo",
  "PsychoNinja", "PsychoKilla", "PsychoClown", "PsychoJugga",
  "TwiztidNinja", "TwiztidKilla", "TwiztidDown",
  "ABKNinja", "ABKJuggalo", "ABKKilla",
  "BlazYaDown", "BlazNinja",
  "JokerCard", "JokerClown", "JokerNinja", "JokerKilla",
  "MiraclesNinja", "MiraclesFaygo",
  "ClownPrince", "RiddleboxICP", "Ringmaster17",
  "FaygoJuggalo", "FaygoClown", "FaygoDown",
  "CarnivalNinja", "CarnivalKilla", "CarnivalDown",
  "Juggalo_Killa", "Juggalo_Life", "Juggalo_Ninja", "Juggalo_Down",
  "Hatchet_Man", "Hatchet_Gang", "Hatchet_Killa", "Hatchet_Ninja",
  "Faygo_Lover", "Faygo_Nation", "Faygo_Ninja",
  "Wicked_Clown", "Wicked_Ninja", "Wicked_Killa",
  "Dark_Carnival", "Dark_Lotus", "Dark_Ninja", "Dark_Killa",
  "Joker_Card", "Joker_Killa", "Joker_Ninja",
  "Ninja_Killa", "Ninja_Clown", "Ninja_Down",
  "Killa_Ninja", "Killa_Clown", "Killa_Down",
  "Psycho_Ninja", "Psycho_Killa", "Psycho_Clown",
  "Lotus_Ninja", "Lotus_Killa", "Lotus_Family",
  "Carnival_Down", "Carnival_Killa",
  "Clown_Ninja", "Clown_Killa", "Clown_Down",
];

export function generateIcpNames(): string[] {
  return [
    ...new Set(
      STANDALONE
        .map((n) => n.trim())
        .filter((n) => {
          if (n.length < 2 || n.length > 15) return false;
          const underscores = (n.match(/_/g) ?? []).length;
          return underscores <= 1;
        }),
    ),
  ];
}
