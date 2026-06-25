# rockenhaus-litigation-public

Personal document repository for active state-court litigation in Michigan. Maintained pro se by Conrad Alan Rockenhaus.

Rendered filings and discovery PDFs for each active matter are synced automatically from the private source repository (`skyphusion-labs/rockenhaus-litigation`) on each successful CI build. Other paths (`opposing/`, `orders/`, `filed/Exhibits/`, etc.) are maintained manually.

## Active matters

| Case | Court | Case Number | Role |
|---|---|---|---|
| Rockenhaus v. Rockenhaus (PPO) | Wayne County Circuit Court (Third Judicial Circuit) | 26-102221-PP | Respondent, pro se |
| Rockenhaus v. Rockenhaus (Divorce) | Wayne County Circuit Court (Third Judicial Circuit), Hon. Nicole N. Goodson | 26-104594-DO | Defendant, pro se |
| Rockenhaus v. Rockenhaus (Divorce) | Washtenaw County Circuit Court (22nd Circuit), Hon. Darlene A. O'Brien | 26-737-DO | Plaintiff, pro se |

## Repository layout

```
rockenhaus-litigation-public/
├── <case_id>/                          Per-matter directory (e.g. wayne_ppo_26-102221-PP)
│   ├── filed/                          Motions, notices, responses authored by Conrad
│   ├── discovery/                      Discovery requests and responses
│   ├── opposing/                       Motions, notices, responses authored by opposing party
│   └── orders/                         Orders from the court
```

The Third Judicial Circuit Case Search Portal is available at [https://cmspublic.3rdcc.org/](https://cmspublic.3rdcc.org/). From there select "Non-Criminal Case Records", solve the captcha, select search by case, type in the case number `26-104594-DO`, press the search button, then select the case to view the Register of Actions.

## License

This repository contains private litigation work product and personal records. No license is granted for redistribution, reuse, or republication of any content. Inadvertent disclosure does not waive privilege.
