---
title: Earn advancement rewards
description: Understand automatic achievement payments, default values, and pending rewards.
category: Activities & rewards
mod: realm-rewards
order: 42
---

## How players earn rewards

Complete a new supported Minecraft advancement. Rewards are processed automatically; players do not need a block, key, or claiming command.

The server discovers vanilla and modded advancements through Minecraft's normal advancement system. A particular advancement pays **once per player**, including after death, a name change, or revoking and earning it again when world records are preserved.

Advancements completed before installation are **not paid retroactively**.

## Default values

| Advancement type | Initial reward |
| --- | --- |
| Normal advancement | 2 € |
| Goal | 5 € |
| Challenge | 10 € |
| Recipes and hidden internal advancements | 0 € |

These are defaults, not guaranteed values on every server. Administrators can change individual rewards and type defaults. A reward already reserved keeps its original amount.

## Pending payments

The supported Origins wallet receives payments. If no usable wallet is available, the money remains pending rather than being discarded.

With Notifications installed, a HUD notice can show the amount and reason. Supported chat messages remain the alternative when the optional notice channel is unavailable.

## Operator configuration

An operator with permission level 2 uses **`/rewards`**. Search by advancement ID or the title known to the server, set an individual value, choose a type default, or disable an entry by setting it to zero.

Advancement IDs are reliable across language differences. Recipes and internal advancements only pay when explicitly assigned a non-zero value.

See the [source guide](https://github.com/ROCKABITS/Mods/blob/main/realm-rewards/README.md) for accepted amounts, persistence, and pending-payment behaviour.
