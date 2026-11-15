---
title: Install the Realm mods
description: Prepare Minecraft, choose your mods, and get clients and server ready to play together.
category: Getting started
order: 1
---

## Before you begin

Most Realm gameplay mods target **Minecraft Java 1.21.1**, **NeoForge 21.1.256+**, and **Java 21**. Contracts & Bounties and Realm Gym also have **Forge 1.20.1 / Java 17** editions. Realm Gym additionally supports **Forge 1.21.1 / Java 21**, with Forge 52.1.20+, and **Fabric 1.21.1 / Java 21**, with Fabric Loader 0.16.14+ and Fabric API 0.116.18+1.21.1. Choose the exact Minecraft and loader edition shown on each download; these editions are not interchangeable.

Install the same version of each gameplay mod on the server and on every participating client. For a LAN world, the hosting player's instance also acts as the server.

## Install your collection

1. Create a Minecraft instance with the Minecraft version, loader and Java version listed for your chosen edition.
2. Choose the mods you want from the [collection](/mods/). Read each mod's dependencies before downloading.
3. Close Minecraft and the server. Place the JAR files in each instance's `mods` folder.
4. Add any required dependencies to the same instances. If you downloaded a ZIP alternative, extract the JAR first.
5. Start the server, then the clients. If a dependency or version is missing, use the loader's error message to identify the required change.

## Realm Origins dependencies

Realm Origins **0.5.7** requires these NeoForge dependencies:

| Dependency | Reference version | Required? |
| --- | --- | --- |
| Origins by IAFEnvoy | 0.3.2 | Yes |
| Jupiter | 2.3.7 | Yes |
| Origins: Classes by IAFEnvoy | 0.3 | Optional |

The [Origins source guide](https://github.com/ROCKABITS/Mods/blob/main/realm-origins/README.md#instalar) links to the exact reference downloads. Realm Economy and Casino use the Origins wallet; check their individual guides when assembling your collection.

## Updating an existing world

Back up the **whole world and character profiles together** before an update. Replace old JARs rather than keeping multiple versions, and update the server and clients together.

Several projects have changed names:

| Current mod | Replaces |
| --- | --- |
| Realm Origins | Chronicles RP |
| Realm Treasury | Crown Ledger |
| Realm Economy | Realm Villager Economy |
| Realm Gym | Realm Fitness |

Each pair shares or migrates existing systems. Do not install both the old and new mod. A downgrade may require restoring the complete pre-update backup.

## What is optional?

Many mods work on their own and gain features when companion mods are installed. Markets can use emeralds; Treasury can recognise an elected ruler through Council; Identity can read a character from Origins.

A required dependency is needed to load or use a feature. An optional integration adds a connection to another installed system. Read the mod page and source guide for the exact combination you plan to use.

The **Season 8 modpack** has its [own page](/modpack/). Its modpack version and release notes are separate from the versions of individual mods.
