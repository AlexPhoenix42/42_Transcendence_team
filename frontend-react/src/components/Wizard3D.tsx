// frontend-react/src/components/Wizard3D.tsx
//
// The Grey Wizard, rendered as a small procedural low-poly three.js model
// (cones + spheres, no external asset) instead of a flat emoji. Owns its
// own tiny scene/camera so it can just be dropped anywhere via CSS position,
// exactly like the emoji token it replaces.

import { useEffect, useRef } from "react"
import * as THREE from "three"

interface Props {
    size?: number
    hopping: boolean
    reaction: "correct" | "wrong" | null
}

export default function Wizard3D({ size = 56, hopping, reaction }: Props) {
    // `size` comes from a board-relative calculation (circleSize * ratio)
    // and is usually fractional. A fractional canvas size can round
    // differently between the CSS-rendered box and the WebGL backing store
    // three.js allocates for it, which is what triggers Firefox's
    // "destination rect smaller than the viewport rect" warning — so the
    // canvas must be an integer number of CSS pixels.
    const px = Math.max(1, Math.round(size))

    const canvasRef = useRef<HTMLCanvasElement>(null)
    const hoppingRef = useRef(hopping)
    const reactionRef = useRef(reaction)
    const glowRef = useRef<THREE.PointLight | null>(null)

    useEffect(() => { hoppingRef.current = hopping }, [hopping])
    useEffect(() => { reactionRef.current = reaction }, [reaction])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 20)
        camera.position.set(0, 1.6, 4.3)
        camera.lookAt(0, 0.6, 0)

        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.setSize(px, px, false)

        scene.add(new THREE.AmbientLight(0xffffff, 0.7))
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.1)
        keyLight.position.set(1.5, 3, 2)
        scene.add(keyLight)

        const glow = new THREE.PointLight(0xffffff, 0, 3)
        glow.position.set(0, 1, 1.2)
        scene.add(glow)
        glowRef.current = glow

        const group = new THREE.Group()

        const robe = new THREE.Mesh(
            new THREE.ConeGeometry(0.48, 1.25, 14),
            new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.85 }),
        )
        robe.position.y = 0.62
        group.add(robe)

        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.26, 16, 16),
            new THREE.MeshStandardMaterial({ color: 0xe3bfa5, roughness: 0.6 }),
        )
        head.position.y = 1.35
        group.add(head)

        const beard = new THREE.Mesh(
            new THREE.ConeGeometry(0.16, 0.42, 10),
            new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.9 }),
        )
        beard.position.set(0, 1.14, 0.1)
        beard.rotation.x = Math.PI
        group.add(beard)

        const hat = new THREE.Mesh(
            new THREE.ConeGeometry(0.3, 0.65, 14),
            new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.7 }),
        )
        hat.position.y = 1.85
        group.add(hat)

        const hatBrim = new THREE.Mesh(
            new THREE.CylinderGeometry(0.32, 0.32, 0.05, 14),
            new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.7 }),
        )
        hatBrim.position.y = 1.55
        group.add(hatBrim)

        const staff = new THREE.Mesh(
            new THREE.CylinderGeometry(0.03, 0.03, 1.4, 8),
            new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 }),
        )
        staff.position.set(0.45, 0.75, 0)
        staff.rotation.z = -0.15
        group.add(staff)

        const staffOrb = new THREE.Mesh(
            new THREE.SphereGeometry(0.08, 12, 12),
            new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0x3b82f6, emissiveIntensity: 0.6 }),
        )
        staffOrb.position.set(0.48, 1.45, 0)
        group.add(staffOrb)

        group.position.y = -0.9
        scene.add(group)

        let frameId = 0
        const start = performance.now()

        function animate() {
            const t = (performance.now() - start) / 1000

            group.rotation.y = Math.sin(t * 0.6) * 0.35

            if (hoppingRef.current) {
                // Frequency tuned so one full arc roughly matches one square-hop
                // (GooseBoard steps the wizard every ~420ms).
                const bounce = Math.abs(Math.sin(t * 7.5))
                group.position.y = -0.9 + bounce * 0.55
                const squash = 1 - bounce * 0.22
                group.scale.set(1 / squash, squash, 1 / squash)
                group.rotation.z = Math.sin(t * 7.5) * 0.15
            } else {
                group.position.y = -0.9 + Math.sin(t * 1.4) * 0.04
                group.scale.set(1, 1, 1)
                group.rotation.z = 0
            }

            if (glowRef.current) {
                const active = reactionRef.current !== null
                glowRef.current.color.setHex(
                    reactionRef.current === "correct" ? 0x4ade80 : reactionRef.current === "wrong" ? 0xf87171 : 0xffffff,
                )
                glowRef.current.intensity = active ? 1.4 : 0
            }

            renderer.render(scene, camera)
            frameId = requestAnimationFrame(animate)
        }
        animate()

        return () => {
            cancelAnimationFrame(frameId)
            renderer.dispose()
            scene.traverse((obj) => {
                if (obj instanceof THREE.Mesh) {
                    obj.geometry.dispose()
                    if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose())
                    else obj.material.dispose()
                }
            })
        }
    }, [px])

    return <canvas ref={canvasRef} style={{ width: px, height: px, display: "block" }} />
}
