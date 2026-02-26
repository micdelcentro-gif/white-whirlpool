import math
from dataclasses import dataclass

GRAVITY = 9.81  # m/s^2
MAX_UTILIZATION = 0.80  # 80% límite normativo


@dataclass
class Load:
    name: str
    weight_kg: float
    cg_height_m: float
    height_m: float


@dataclass
class Crane:
    name: str
    capacity_kg: float
    boom_length_m: float
    base_weight_kg: float
    outrigger_area_m2: float


@dataclass
class LiftState:
    angle_deg: float
    radius_m: float
    load_share: float  # % carga soportada por este equipo


class LiftSimulation:

    def __init__(self, crane: Crane, load: Load):
        self.crane = crane
        self.load = load

    def calculate_load_moment(self, effective_weight_kg, radius_m):
        force = effective_weight_kg * GRAVITY
        return force * radius_m  # Nm

    def calculate_utilization(self, effective_weight_kg):
        return effective_weight_kg / self.crane.capacity_kg

    def ground_bearing_pressure(self, total_weight_kg):
        total_force = total_weight_kg * GRAVITY
        return total_force / self.crane.outrigger_area_m2  # Pascales

    def simulate_transition(self, steps=10):
        results = []

        for step in range(steps + 1):
            angle = 90 - (90 * step / steps)  # 90° vertical → 0° horizontal
            load_share = 1.0 if angle > 30 else 0.30  # transferencia parcial
            effective_weight = self.load.weight_kg * load_share

            radius = math.cos(math.radians(angle)) * (self.load.cg_height_m)
            moment = self.calculate_load_moment(effective_weight, radius)
            utilization = self.calculate_utilization(effective_weight)
            gbp = self.ground_bearing_pressure(
                self.crane.base_weight_kg + effective_weight
            )

            safety_status = "OK"
            if utilization > MAX_UTILIZATION:
                safety_status = "OVERLOAD"

            results.append({
                "angle_deg": round(angle, 2),
                "effective_weight_kg": round(effective_weight, 2),
                "radius_m": round(radius, 2),
                "load_moment_Nm": round(moment, 2),
                "utilization_%": round(utilization * 100, 2),
                "ground_pressure_Pa": round(gbp, 2),
                "status": safety_status
            })

        return results


# ---------------------------
# EJEMPLO DE EJECUCIÓN
# ---------------------------

if __name__ == "__main__":

    expander = Load(
        name="Expander",
        weight_kg=17557,
        cg_height_m=3.80,
        height_m=7.20
    )

    versa_lift = Crane(
        name="Versa Lift 40/60",
        capacity_kg=27215,  # ejemplo
        boom_length_m=6.0,
        base_weight_kg=15000,
        outrigger_area_m2=4.0
    )

    simulation = LiftSimulation(versa_lift, expander)
    results = simulation.simulate_transition(steps=12)

    for r in results:
        print(r)
