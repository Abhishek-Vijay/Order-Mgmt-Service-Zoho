pipeline {
    agent { label 'build'}
    stages {
        
        stage('Checkout') {
            steps {
                cleanWs()
                checkout scm
            }
        }
        stage('Image Build') {
            steps {
                script{
                    def commit_hash = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                    def build_tag = sh(script: "echo " + params.BRANCH + "_"+ commit_hash + "_" + env.BUILD_NUMBER, returnStdout: true).trim()
                    def image_tag = sh(script: "echo " + env.DOCKER_HUB + "/" + "uc-order-mgmt" + ":" + build_tag, returnStdout: true).trim()
                    echo "image_tag: " + image_tag
                    sh "docker build -t ${image_tag} ."
                }
            }
        }
        stage('Artifact Upload') {
            steps {
                script{
                    def commit_hash = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
                    def build_tag = sh(script: "echo " + params.BRANCH + "_"+ commit_hash + "_" + env.BUILD_NUMBER, returnStdout: true).trim()
                    def image_tag = sh(script: "echo " + env.DOCKER_HUB + "/" + "uc-order-mgmt" + ":" + build_tag, returnStdout: true).trim()
                    sh "aws ecr get-login-password --region ${env.AWS_REGION} | docker login --username ${env.DOCKER_USERNAME} --password-stdin ${env.DOCKER_HUB}"
                    echo "uploading the dimage ${image_tag}"
                    sh "docker push ${image_tag}"
                    sh "echo '{\"image_name\" : \"uc-order-mgmt\", \"image_tag\" : \"${build_tag}\"}' > metadata.json"
                }
            }
        }
    }
    post {
        always {
            archiveArtifacts artifacts: 'metadata.json' , onlyIfSuccessful: true
            emailext body: '''$PROJECT_NAME - Build # $BUILD_NUMBER - $BUILD_STATUS: Check console output at $BUILD_URL to view the results.''', subject: '$PROJECT_NAME - Build # $BUILD_NUMBER - $BUILD_STATUS!', to: env.Order_mgmt_team
        }
    }

}
