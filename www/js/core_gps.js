class GpsTrackMetrics {
    constructor(distanceThresholdMeters = 2) {
        this.distanceThresholdMeters = distanceThresholdMeters;
        this.referencePoint = null;
        this.referenceTime = null;
    }

    reset(latitude = null, longitude = null, timestamp = null) {
        this.referencePoint = Number.isFinite(latitude) && Number.isFinite(longitude)
            ? { latitude, longitude }
            : null;
        this.referenceTime = this.referencePoint ? this.getTimestamp(timestamp) : null;
    }

    update(latitude, longitude, speedMs, timestamp) {
        const point = { latitude, longitude };
        const time = this.getTimestamp(timestamp);
        let distanceNm = 0;
        let speedKnots = Number.isFinite(speedMs) && speedMs > 0
            ? speedMs * 1.94384
            : 0;

        if (!this.referencePoint) {
            this.referencePoint = point;
            this.referenceTime = time;
            return { distanceNm, speedKnots };
        }

        const distanceMeters = this.distanceBetween(this.referencePoint, point);
        if (distanceMeters > this.distanceThresholdMeters) {
            distanceNm = distanceMeters / 1852;

            if (speedKnots === 0 && time > this.referenceTime) {
                const elapsedSeconds = (time - this.referenceTime) / 1000;
                speedKnots = (distanceMeters / elapsedSeconds) * 1.94384;
            }

            this.referencePoint = point;
            this.referenceTime = time;
        }

        return { distanceNm, speedKnots };
    }

    getTimestamp(timestamp) {
        const parsedTimestamp = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
        return Number.isFinite(parsedTimestamp) ? parsedTimestamp : Date.now();
    }

    distanceBetween(pointA, pointB) {
        const radians = degrees => degrees * Math.PI / 180;
        const latitudeDelta = radians(pointB.latitude - pointA.latitude);
        const longitudeDelta = radians(pointB.longitude - pointA.longitude);
        const haversine = Math.sin(latitudeDelta / 2) ** 2
            + Math.cos(radians(pointA.latitude)) * Math.cos(radians(pointB.latitude))
            * Math.sin(longitudeDelta / 2) ** 2;

        return 6371000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
    }
}

if (typeof module !== 'undefined') {
    module.exports = { GpsTrackMetrics };
}
