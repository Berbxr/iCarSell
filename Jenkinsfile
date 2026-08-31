pipeline {
  agent any

  options {
    disableConcurrentBuilds()
  }

  // El trigger del webhook (Generic Webhook Trigger, con token) se configura
  // directo en el job vía Job-DSL/JCasC en el VPS (.ops/jenkins/casc.yaml),
  // no aquí, porque este archivo vive en un repo público y el token no debe
  // quedar expuesto en el historial de git.

  stages {
    stage('Deploy') {
      steps {
        sh '''
          set -e
          cd /root/apps/iCarSell
          git fetch origin master
          git checkout master
          git reset --hard origin/master
          docker compose -p icarsell build
          docker compose -p icarsell up -d
          docker image prune -f
        '''
      }
    }
  }

  post {
    success {
      echo 'Deploy de iCarSell completado.'
    }
    failure {
      echo 'Deploy de iCarSell fallido — revisar el log de esta build.'
    }
  }
}
