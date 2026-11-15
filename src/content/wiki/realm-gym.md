---
title: Train at your gym
description: Choose your Realm Gym edition, train on animated machines and build a personal workout routine.
category: Activities & rewards
mod: realm-gym
order: 95
---

## Install Realm Gym

Choose an edition from the [Realm Gym downloads](/mods/realm-gym/#downloads). Install the same edition on the server and every client.

| Edition | Version | Requirements | Equipment |
| --- | --- | --- | --- |
| NeoForge · Minecraft 1.21.1 | 0.7.1 | NeoForge 21.1.256+, Java 21 | Eight machines |
| Fabric · Minecraft 1.21.1 | 0.7.1 | Fabric Loader 0.16.14+, Java 21 and Fabric API 0.116.18+1.21.1 | Eight machines |
| Forge · Minecraft 1.21.1 | 0.7.1 | Forge 52.1.20+, Java 21 | Eight machines |
| Forge · Minecraft 1.20.1 | 0.7.1 | Forge 47.4.0+, Java 17 | Six machines |

For Fabric, add [Fabric API](https://www.curseforge.com/minecraft/mc-mods/fabric-api) for Minecraft 1.21.1 to both the server and clients. Realm Gym works independently of Realm Origins and other stats mods.

Realm Gym was previously called **Realm Fitness**. Replace the old JAR when updating. The mod retains its existing machine IDs and saved progression format.

## Start a set

1. Craft a machine and place it on a solid floor with enough space. Benches, treadmills, rowing machines and leg press use a 2 × 3 footprint; the other machines use 2 × 2. Reserve three blocks of height.
2. Right-click the machine to mount it and begin. Without an active plan, you train a free set of eight repetitions.
3. Follow the compact minigame HUD. Press **Shift** to leave or **F5** to change perspective.

Sneak-right-click **before entering** to increase the weight or resistance. Loads respect your unlocked levels and cycle back to the minimum after the maximum.

## Exercises

All eight exercises are available in the Minecraft 1.21.1 editions. Forge 1.20.1 includes the first six.

| Equipment | Controls | Attribute |
| --- | --- | --- |
| Bench press | Tap Space repeatedly against the draining pressure | Strength |
| Treadmill | Alternate A and D while managing pace and stamina | Fitness |
| Punching bag | Time M1/M2 punches as the marker crosses the centre | Coordination |
| Pull-up bar | Hold Space to rise, release to lower; A/D for balance | Body control |
| Rowing machine | Charge with W, release in the target zone, recover with S | Aquatic endurance |
| Squat rack | W to lower, release to pause, S to rise | Leg power |
| Leg press | Balance each leg's pressure with A/D inside green, then release both keys to return | Leg power, shared with squats |
| Cable rope triceps | Hold Space to pull, click M1/M2 inside green, hold the short contraction and release to return | Strength, shared with bench press |

Leg press loads start at **40 kg**, increase in 10 kg steps and unlock up to **240 kg**. Cable triceps starts at **5 kg**, increases in 5 kg steps and unlocks up to **55 kg**. The two new machines have their own records and load selections, while sharing progression and muscle fatigue with the corresponding existing attribute.

## Plan your training

Press **K** to open the athlete profile. Choose or create a routine with exercises, sets, repetitions, loads and rest periods. Your active workout is saved between sessions.

Training develops 20 permanent levels in each of six attributes. Lighter loads become easier as you progress. Daily XP limits, fatigue and recovery encourage regular training. Record boards show results by exercise, load, repetitions, period and gym area.

## Optional physical condition

Physical condition is **disabled by default**. In version 0.7.1, operators can control it directly in Minecraft:

```text
/gym conditioning on
/gym conditioning off
/gym conditioning status
```

Enabling or disabling requires operator permission level 2. Changes apply immediately, are saved automatically and survive server restarts. Everyone can check the current state with `/gym conditioning status` or `/gym conditioning`. The console and the `/fitness conditioning` alias are supported. No file editing or `/gym reload` is needed for these commands.

By default, condition stays at 100% for seven full days without maintenance, then loses five percentage points per additional complete day, down to 60%. A potential +10% damage bonus becomes +8% at 80% condition. Lifetime XP, levels, unlocked weights, routines and personal records remain saved.

Two successful sets of at least eight repetitions for an attribute maintain it and restore 20 condition points, once per attribute per training day. Bench press and cable triceps share strength; squats and leg press share leg power. Maintenance also works after reaching the daily XP cap. Failed, cancelled and shorter sets do not count.

The RPG profile shows condition and the active bonus. Hover over an attribute to see today's maintenance and the time until the next loss. Server owners can configure the grace period, loss, minimum, recovery and set requirement. Set `conditioning.countOfflineTime` to `false` to count only time connected to that world.

Disabling the option restores the full bonuses from permanent levels and pauses saved condition. Existing profiles receive a full grace period when the feature is first enabled. [Full configuration guide](https://github.com/ROCKABITS/Mods/blob/main/realm-gym/CONDITIONING.md).

## Commands

`/gym` opens your profile. Operators can use `/gym equipment` to obtain the equipment and `/gym reload` to reload settings. Existing `/fitness` commands remain aliases.

Find the full configuration and validation details in the source guides for [NeoForge 1.21.1](https://github.com/ROCKABITS/Mods/tree/main/realm-gym), [Fabric 1.21.1](https://github.com/ROCKABITS/Mods/tree/main/realm-gym-fabric-1.21.1), [Forge 1.21.1](https://github.com/ROCKABITS/Mods/tree/main/realm-gym-forge-1.21.1) and [Forge 1.20.1](https://github.com/ROCKABITS/Mods/tree/main/realm-gym-forge-1.20.1).
