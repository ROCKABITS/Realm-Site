---
title: Everyday kingdom economics
description: Use your wallet for village trading, workstations, brewing, and beacons.
category: Economy & trade
mod: realm-economy
order: 22
---

## Prepare the economy

Realm Economy 0.4.1 uses **Realm Origins 0.5.7** and its dependencies. It replaces Realm Villager Economy: remove that older JAR when updating.

Install matching versions on clients and server. Treasury receives applicable public revenue, and Council identifies the elected President. Read [installation](/wiki/installation/) before changing an existing world.

## The Economy Desk

The physical **Economy Desk** gives the sworn President access to public price and tax policy. Administrative limits bound those choices.

Regular players can also consult public prices and collect their completed potion batches at the desk. Read the displayed cost before confirming a service, especially after the government changes policy.

## Trading with villagers

The mod integrates the Origins wallet with supported villager purchases. The price uses the offer's current emerald cost and the configured reference rate. Additional materials, such as a book for an enchanted-book trade, are still required.

Selling materials to villagers continues to give **physical emeralds**, without euros or tax. The reference rate is not a direct emerald-to-money exchange. Hover over an enchanted book to read its complete native tooltip before buying.

## Workstations and services

Realm Economy brings money into several survival systems:

- **Anvils:** native repair and combination rules apply, with euros replacing XP. Vanilla compatibility and “Too Expensive” limits remain.
- **Enchanting:** select one of three runes. Lapis is still required, while XP levels are neither required nor consumed. The displayed option level determines the price.
- **Smithing:** choose the template, equipment, and material. The native recipe's materials are consumed and item components are preserved.
- **Brewing:** choose up to three bottles and one ingredient. A blaze powder funds 20 personal batches; each paid batch takes 20 real seconds. Collect the finished potions at a paid stand or Economy Desk without a second charge.
- **Beacons:** build a valid pyramid with an unobstructed beam, choose unlocked effects, and review the timed activation. The initial duration is 600 real seconds; there is no automatic renewal.

These systems have individual conditions and limits. Use the full source guide for the current workstation behaviour rather than assuming every vanilla interaction charges identically.

## Prices and public revenue

Price-setting authority and operator administration are separate. The elected President governs within the configured limits; optional integrations do not grant blanket administrative access.

Back up world, profiles, and treasury as one set before updates. The old Villager Economy data is migrated when appropriate, while current records use Realm Economy's own format.

See the [service-by-service guide](https://github.com/ROCKABITS/Mods/blob/main/realm-economy/README.md) for costs, recipes, brewing, beacon duration, and configuration.
