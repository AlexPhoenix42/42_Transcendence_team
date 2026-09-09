# 🎮 Pac-Man Multiplayer Game Rules

## 📋 Overview

This document describes the advanced game rules for the Pac-Man multiplayer system supporting 1-2 Pac-Men and 1-4 ghosts with unique abilities.

---

## 👻 Pac-Man Players

### Configuration: 1 or 2 Players

#### **Pac-Man 1 (Always Normal)**
- ✅ Can eat grain
- ❌ Cannot destroy walls
- ❌ Cannot go to prison
- ❌ Dies on ghost contact (unless ghost is blocker/freezer)

#### **Pac-Man 2 (Invincible - Only with 2 Players)**
- ❌ **Cannot eat grain** (0 points from food)
- ✅ **Cannot die** (immune to all ghosts)
- ✅ **Can destroy walls** (passes through walls like they don't exist)
- ✅ **Can be imprisoned** (locked in prison for 15 seconds when ghost uses ability)

---

## 👹 Ghosts

### Configuration: 1, 2, 3, or 4 Ghosts

#### **1 Ghost - Wall Maker**
```
Ability: Create Temporary Walls
- Activates on command
- Lasts 10 seconds
- Creates obstacles in the maze
- Cannot kill directly
```

#### **2 Ghosts - Killer Ghosts**
```
Ability: Kill Pac-Men
- Kills normal Pac-Men on contact
- Cannot kill invincible Pac-Men (Pac-Man 2)
- Standard chase/scatter AI
- Worth 200-1600 points when eaten (frightened mode)
```

#### **3 Ghosts - Mix (2 Killers + 1 Blocker)**
```
Ghost 1-2: Killer
- Kill Pac-Men on contact

Ghost 3: Blocker
- Blocks Pac-Men on contact
- Does NOT kill
- Stops Pac-Man movement
```

#### **4 Ghosts - Full Mix (2 Killers + 1 Blocker + 1 Freezer)**
```
Ghost 1-2: Killer
- Kill Pac-Men on contact

Ghost 3: Blocker
- Blocks Pac-Men on contact
- Does NOT kill

Ghost 4: Freezer
- Freezes Pac-Men for 5 seconds
- Must return to prison for 7 second recharge
- Can freeze multiple Pac-Men (with recharge between each)
```

---

## 🎯 Interaction Rules

### Ghost-Pacman Collisions

| Ghost Type | Normal Pac-Man | Invincible Pac-Man |
|---|---|---|
| **Killer** | 💀 Dies | ✅ Immune |
| **Blocker** | 🚫 Blocked | ✅ Immune |
| **Freezer** | ❄️ Frozen (5s) | ✅ Immune |
| **Wall Maker** | - | - |

### Prison System

- **Triggered by:** Only invincible Pac-Man (Pac-Man 2) can be imprisoned
- **Duration:** 15 seconds
- **Effect:** Pac-Man cannot move during prison time
- **Triggered by:** When any ability requires locking up a Pac-Man

### Freeze System

- **Triggered by:** Freezer Ghost (Type 4)
- **Duration:** 5 seconds
- **Effect:** Pac-Man cannot move or change direction
- **Ghost Recharge:** 7 seconds in prison before can freeze again

### Wall Creation

- **Ghost Type:** Only Wall Maker Ghost (Type 1)
- **Duration:** 10 seconds
- **Mechanic:** Creates temporary obstacles
- **Effect:** Both Pac-Men cannot pass

---

## 💻 Usage in Code

### Initialize Game Rules

```javascript
import GameRules from './GameRules.js';

// Create rules for 2 Pac-Men and 4 ghosts
const gameRules = new GameRules(2, 4);

// Get summary
console.log(gameRules.getSummary());
```

### Check Pac-Man Abilities

```javascript
// Check if Pac-Man can eat grains
if (gameRules.canEatGrains(0)) {
    pacman1.eatGrain();
}

// Check if Pac-Man can destroy walls
if (gameRules.canDestroyWalls(1)) {
    pacman2.destroyWall();
}

// Check if Pac-Man is invincible
if (gameRules.isInvincible(1)) {
    pacman2.setInvincibleVisuals();
}
```

### Check Ghost Abilities

```javascript
// Get ghost type
const ghostType = gameRules.getGhostType(3); // Ghost 4

if (ghostType === GHOST_TYPE_FREEZER) {
    // Ghost 4 can freeze
    gameRules.freezePacman('ghost_3', 'pacman_1');
}

// Check if ghost can create walls
if (gameRules.isCreatingWalls('ghost_0')) {
    // Activate wall creation visuals
    activateWallCreationEffect();
}
```

### Handle Collisions

```javascript
// When ghost and Pac-Man collide
const collision = gameRules.handleGhostPacmanCollision(ghostIndex, pacmanId);

switch(collision.result) {
    case 'death':
        pacman.die();
        break;
    case 'blocked':
        pacman.stopMovement();
        break;
    case 'frozen':
        pacman.setFrozenState();
        break;
    case 'immune':
        // No effect
        break;
}
```

### Manage Prison State

```javascript
// Imprison a Pac-Man
const result = gameRules.imprisonPacman('pacman_1');
if (result.success) {
    pacman.enterPrisonMode(); // 15 seconds
}

// Check if Pac-Man can move
if (!gameRules.canPacmanMove('pacman_1')) {
    // Pac-Man is imprisoned, disable movement
}

// Get remaining prison time
const timeLeft = gameRules.getRemainingPrisonTime('pacman_1');
```

### Manage Freeze State

```javascript
// Check if Pac-Man is frozen
if (gameRules.isPacmanFrozen('pacman_0')) {
    pacman.showFrozenEffect();
}

// Get remaining freeze time
const timeLeft = gameRules.getRemainingFreezeTime('pacman_0');

// Update ghost recharge status (call in game loop)
if (gameRules.updateGhostRecharge('ghost_3')) {
    ghost.showReadyEffect(); // Ghost 4 can freeze again
}
```

---

## 🎮 Game Loop Integration

Add these calls to your main game loop:

```javascript
function gameLoop() {
    // Update all Pac-Men states
    for (let pacman of pacmen) {
        if (!gameRules.canPacmanMove(pacman.id)) {
            pacman.pauseMovement();
        }
        
        if (gameRules.isPacmanFrozen(pacman.id)) {
            pacman.showFrozenEffect();
        }
        
        if (gameRules.isPacmanImprisoned(pacman.id)) {
            pacman.showPrisonEffect();
        }
    }

    // Update all Ghost states
    for (let ghost of ghosts) {
        gameRules.updateGhostRecharge(ghost.id);
        
        if (gameRules.isCreatingWalls(ghost.id)) {
            ghost.showWallCreationEffect();
        }
    }

    // Handle collisions
    for (let pacman of pacmen) {
        for (let ghost of ghosts) {
            if (pacman.collidesWith(ghost)) {
                const collision = gameRules.handleGhostPacmanCollision(ghost.index, pacman.id);
                processCollision(collision);
            }
        }
    }
}
```

---

## 📊 Game Configuration Examples

### Configuration 1: Solo Mode
```javascript
const rules = new GameRules(1, 1);
// 1 Pac-Man (normal) vs 1 Wall-Maker Ghost
```

### Configuration 2: 1v2
```javascript
const rules = new GameRules(1, 2);
// 1 Pac-Man (normal) vs 2 Killer Ghosts
```

### Configuration 3: 2v3
```javascript
const rules = new GameRules(2, 3);
// 2 Pac-Men (normal + invincible) vs 2 Killers + 1 Blocker
```

### Configuration 4: 2v4 (Full Game)
```javascript
const rules = new GameRules(2, 4);
// 2 Pac-Men (normal + invincible) vs 2 Killers + 1 Blocker + 1 Freezer
```

---

## 🎬 Event Triggers

Events that should trigger rule checks:

1. **Grain Eaten:** Only Pac-Man 1 should add score
2. **Wall Touched:** Pac-Man 2 can pass through
3. **Ghost Collision:** Apply rules based on ghost type
4. **Prison Entry:** Pac-Man 2 gets locked for 15s
5. **Freeze Event:** Pac-Man gets frozen for 5s
6. **Recharge Complete:** Ghost 4 can freeze again

---

## 📝 Summary Table

| Feature | P1 (Normal) | P2 (Invincible) | G1 (Wall) | G2-3 (Killer) | G3 (Blocker) | G4 (Freezer) |
|---|---|---|---|---|---|---|
| Eat Grain | ✅ | ❌ | - | - | - | - |
| Destroy Wall | ❌ | ✅ | - | - | - | - |
| Die to Ghost | ✅ | ❌ | - | ✅ | ❌ | ❌ |
| Prison | ❌ | ✅ (15s) | - | - | - | - |
| Freeze | ❌ | ❌ | - | - | - | ✅ (5s) |
| Create Wall | - | - | ✅ (10s) | - | - | - |
| Recharge | - | - | - | - | - | ✅ (7s) |

